/**
 * O roteiro de cada painel para o robô de DNS (23/11/2026). Estudado nos próprios
 * painéis e nas centrais de ajuda (Registro.br lido no código do painel deles; os
 * outros nas ajudas oficiais e em guias de Nuvemshop/HostGator/Hostinger). Vai no
 * pedido à IA: o caminho, os nomes dos botões e as armadilhas de cada lugar.
 * O que não estiver aqui a IA resolve olhando a tela.
 */

const ROTEIROS: Record<string, (d: string) => string> = {
  'Registro.br': (d) => `ROTEIRO — Registro.br (painel em registro.br/painel):
1. Abra https://registro.br/painel/dominios/?dominio=${d} (ou clique no domínio na lista "Domínios").
2. Na seção "DNS": botão "Configurar zona DNS" (modo avançado) ou "Configurar endereçamento" (modo básico).
3. Se estiver no modo básico: botão "Modo avançado" → diálogo "Modo Avançado" → "Confirmar". A página recarrega.
   Se aparecer "Domínio em transição. Por favor, aguarde alguns minutos e tente novamente.": espere 30 s, recarregue (abrir o mesmo endereço) e repita.
4. Tabela "Tabela de zonas no DNS" (colunas Tipo, Nome, Dados). Ela mostra 10 por página: escolha 40 em "por página" para ver tudo.
5. Apagar: clique no "✕" (título "Remover record") da linha. Não apaga na hora: só marca (vira "↶"). Não há diálogo.
6. Criar: "Nova entrada" → Tipo (select, escolha primeiro: A ou CNAME) → Nome (VAZIO para a raiz; "www" para o www; NUNCA "@") → campo do valor ("Endereço IPv4" no A, "Nome do servidor" no CNAME) → "Adicionar". Se o botão virar "Record já cadastrado", já existe: siga.
7. No fim, "Salvar alterações". Sucesso = "Zona DNS atualizada com sucesso!".
NUNCA clique em "Alterar servidores DNS" nem em "Utilizar DNS do Registro.br".`,

  GoDaddy: () => `ROTEIRO — GoDaddy:
1. Em "Meus produtos"/"Portfólio de domínios", clique no domínio e vá em "DNS" (ou "Gerenciar DNS").
2. Se houver "Encaminhamento"/"Forwarding" do domínio ligado, remova o encaminhamento.
3. Registros: apague os da lista APAGAR (ícone de lápis/lixeira ou menu da linha → "Excluir"/"Delete", confirme). Um A "Parked"/"Estacionado" na raiz também sai.
4. "Adicionar novo registro"/"Add New Record": Tipo, Nome ("@" para a raiz, "www"), Valor ("Aponta para"/"Value"), TTL padrão → "Salvar".
5. O www costuma já existir como CNAME para "@": edite o valor para o da lista CRIAR (ou apague e crie).`,

  Hostinger: () => `ROTEIRO — Hostinger (hPanel):
1. "Domínios" → o domínio → "DNS / Servidores de nomes" (ou "Gerenciar registros DNS").
2. Apague da tabela os da lista APAGAR ("Excluir"/"Delete" → confirmar). Um ALIAS ou CNAME na raiz apontando para a Hostinger/CDN também sai.
3. "Adicionar registro": Tipo, Nome ("@" para a raiz, "www"), "Aponta para", TTL padrão → "Adicionar registro".`,

  Cloudflare: () => `ROTEIRO — Cloudflare:
1. Clique no domínio → "DNS" → "Registros"/"Records".
2. Apague os da lista APAGAR ("Editar" → "Excluir"/"Delete" → confirmar).
3. "Adicionar registro"/"Add record": Tipo, Nome ("@" para a raiz, "www"), IPv4/Destino, e DESLIGUE o proxy (nuvem cinza, "Somente DNS"/"DNS only") → "Salvar".`,

  Locaweb: () => `ROTEIRO — Locaweb:
- Entrada: centraldocliente.locaweb.com.br (tem verificação em duas etapas: é com o cliente).
- Domínio registrado na Locaweb: produto "Registro de domínio" (abre outra aba) → "Administrar" ao lado do domínio → no fim, "Zona DNS" → "Consulte e altere zona de DNS"/"Editar zona DNS".
  Criar: "Adicionar entrada" → "Tipo de Entrada" → "Entrada" (raiz = "." — um ponto; www = "www") e "Conteúdo" → "Adicionar entradas".
- Hospedagem de sites (painelhospedagem.locaweb.com.br): domínio → "três pontinhos" → "Zona de DNS". Criar: "Adicionar entrada" → clicar no quadrado do tipo → preencher → "Salvar Configurações". Excluir: "Excluir" na linha → "Excluir entrada".`,

  HostGator: (d) => `ROTEIRO — HostGator Brasil:
- Portal do Cliente (cliente.hostgator.com.br): menu "Domínios" → "Configurar domínio" → "Editar Zona Avançada de DNS" → "Ok, continuar para a Zona de DNS".
  Criar: "Adicionar registro" → Tipo, Nome (raiz: vazio ou "@"), TTL, Valor → "Adicionar". Editar/Excluir na linha.
- cPanel ("Editor de Zona"/"Zone Editor" → "Gerenciar" no domínio): nomes completos com ponto final (raiz = "${d}.", www = "www.${d}."). "Adicionar Registro" → Nome, TTL, Tipo, Registro → "Salvar". Excluir → confirmar "Continuar".
NUNCA clique em "Reset DNS Zone"/"Redefinir zona".`,

  KingHost: () => `ROTEIRO — KingHost:
1. Painel de Controle → o domínio (ícone de configuração) → "Gerenciar DNS".
2. Apagar: ícone de lixeira na linha (confirme).
3. Criar: "Adicionar DNS" → Host (raiz "@"; se recusar, "."), Tipo ("Adress (A)" ou "CNAME"), Destino → "Adicionar DNS"/"Inserir DNS". Uma entrada por vez.`,

  'UOL Host': () => `ROTEIRO — UOL Host (dois painéis):
- Novo: "Domínios" → "Configurar" → "Administrar DNS" → o domínio → "Configurar Zonas DNS" → "Criar nova entrada": "Selecione tipo de entrada", "Entrada" (raiz "@", "www"), "Destino" → "Salvar entrada". Excluir: "Excluir" na linha.
- Antigo (painelhost.uol.com.br): menu "≡" do domínio → "Alterar Zona de DNS" → "Gerenciar"; cada tipo tem "Visualizar" → "Criar nova entrada" (Entrada, Destino, Status = Ativado) → ícone ✔ para salvar.`,
};

export function roteiroDo(provedor: string | null, dominio: string): string {
  const r = provedor ? ROTEIROS[provedor] : undefined;
  return r ? r(dominio) : `ROTEIRO — painel desconhecido: procure no menu do domínio por "DNS", "Zona DNS", "Gerenciar DNS", "Registros DNS" ou "Editor de zona". Copie o formato do nome que as linhas já existentes usam para a raiz.`;
}
