/**
 * Um cliente mínimo do Chrome DevTools Protocol, só com o que o robô de domínio
 * usa (23/11/2026). Conecta no navegador da Browserbase pelo WebSocket da sessão,
 * prende-se à aba e manda comandos. Sem biblioteca: o Playwright não roda aqui.
 */

type Pendente = { ok: (v: unknown) => void; erro: (e: Error) => void };

export class Navegador {
  private ws!: WebSocket;
  private n = 0;
  private pendentes = new Map<number, Pendente>();
  private sessao = '';

  static async conectar(url: string): Promise<Navegador> {
    const b = new Navegador();
    await new Promise<void>((ok, erro) => {
      b.ws = new WebSocket(url);
      b.ws.onopen = () => ok();
      b.ws.onerror = () => erro(new Error('Não consegui abrir o navegador na nuvem.'));
      b.ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.id && b.pendentes.has(m.id)) {
          const p = b.pendentes.get(m.id)!;
          b.pendentes.delete(m.id);
          if (m.error) p.erro(new Error(m.error.message ?? 'erro do navegador'));
          else p.ok(m.result);
        }
      };
    });
    return b;
  }

  /** Comando no navegador (sem sessão) ou na aba presa (com). */
  enviar<T = Record<string, unknown>>(metodo: string, params: Record<string, unknown> = {}, naAba = true, ms = 30_000): Promise<T> {
    const id = ++this.n;
    const msg: Record<string, unknown> = { id, method: metodo, params };
    if (naAba && this.sessao) msg.sessionId = this.sessao;
    return new Promise<T>((ok, erro) => {
      const t = setTimeout(() => { this.pendentes.delete(id); erro(new Error(`${metodo}: sem resposta`)); }, ms);
      this.pendentes.set(id, { ok: (v) => { clearTimeout(t); ok(v as T); }, erro: (e) => { clearTimeout(t); erro(e); } });
      this.ws.send(JSON.stringify(msg));
    });
  }

  /** Prende-se à aba visível (a última página aberta, que é a que o cliente vê). */
  async prenderAba() {
    const { targetInfos } = await this.enviar<{ targetInfos: { targetId: string; type: string }[] }>('Target.getTargets', {}, false);
    let pagina = [...targetInfos].reverse().find((t) => t.type === 'page');
    if (!pagina) {
      const { targetId } = await this.enviar<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
      pagina = { targetId, type: 'page' };
    }
    const { sessionId } = await this.enviar<{ sessionId: string }>('Target.attachToTarget', { targetId: pagina.targetId, flatten: true }, false);
    this.sessao = sessionId;
    await this.enviar('Page.enable');
    await this.enviar('Runtime.enable');
  }

  async ir(url: string) { await this.enviar('Page.navigate', { url }); }

  async avaliar<T = unknown>(expressao: string): Promise<T> {
    const r = await this.enviar<{ result: { value: T }; exceptionDetails?: unknown }>('Runtime.evaluate', {
      expression: expressao, returnByValue: true, awaitPromise: true,
    });
    return r.result?.value as T;
  }

  async foto(): Promise<string> {
    const r = await this.enviar<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
    return r.data;
  }

  async clicarEm(x: number, y: number) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.enviar('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }

  async escrever(texto: string) { await this.enviar('Input.insertText', { text: texto }); }

  async tecla(nome: 'Enter' | 'Tab' | 'Escape' | 'Backspace') {
    const codigos: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8 };
    for (const type of ['keyDown', 'keyUp']) {
      await this.enviar('Input.dispatchKeyEvent', {
        type, key: nome, code: nome, windowsVirtualKeyCode: codigos[nome], ...(nome === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}),
      });
    }
  }

  fechar() { try { this.ws.close(); } catch { /* já fechado */ } }
}
