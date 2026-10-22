/* =========================================================
   RASEC Espetinhos — Totem PWA
   Lógica de UI, carrinho, checkout e persistência localStorage.
   ========================================================= */

'use strict';

/* ---------------------- Catálogo ------------------------ */
const SABORES = Object.freeze([
  {
    id: 'carne',
    nome: 'Carne',
    emoji: '🥩',
    descricao: 'O clássico do espeto: suculento, no ponto, com tempero da casa.',
    preco: 12.0,
  },
  {
    id: 'frango',
    nome: 'Frango',
    emoji: '🍗',
    descricao: 'Macio e dourado, direto da brasa para o seu paladar.',
    preco: 10.0,
  },
  {
    id: 'linguica',
    nome: 'Linguiça',
    emoji: '🌭',
    descricao: 'Toscana grelhada com aquele pincho defumado inconfundível.',
    preco: 10.0,
  },
]);

const FORMAS_PAGAMENTO = Object.freeze(['Pix', 'Dinheiro']);


/* ----------------------- Storage ------------------------- */
const CHAVE_ESQUEMA = 'rasec:v1:';
const CHAVES = Object.freeze({
  carrinho: CHAVE_ESQUEMA + 'carrinho',
  pedidos: CHAVE_ESQUEMA + 'pedidos',
  proximoNumero: CHAVE_ESQUEMA + 'proximoNumero',
  instalado: CHAVE_ESQUEMA + 'instalado',
});

function lerDados(chave, valorPadrao) {
  try {
    const bruto = localStorage.getItem(chave);
    if (bruto === null) return valorPadrao;
    return JSON.parse(bruto);
  } catch (erro) {
    console.warn(`[rasec] ${chave} corrompido, usando padrão:`, erro);
    try { localStorage.removeItem(chave); } catch (_) { /* ignora */ }
    return valorPadrao;
  }
}

function gravarDados(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (erro) {
    if (erro instanceof Error && erro.name === 'QuotaExceededError') {
      mostrarAviso('Memória do aparelho cheia — pedido não foi salvo.');
    } else {
      mostrarAviso('Não foi possível salvar os dados.');
    }
    console.warn('[rasec] falha ao gravar:', erro);
  }
}

/* ------------------------- API (backend) ------------------------- */
// Mesmo origin em produção; em dev o backend roda na porta 3000.
const API_BASE = (() => {
  const salva = lerDados('rasec:v1:apiBase', '');
  if (salva) return salva;
  return location.port === '8091' ? 'http://127.0.0.1:3000' : './';
})();

async function chamarAPI(caminho, opcoes = {}) {
  const resposta = await fetch(API_BASE + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${resposta.status}`);
  }
  return resposta.json();
}

/* ---------------------- Formatação ---------------------- */
const fmoeda = (valor) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ------------------------ Estado ------------------------- */
let pedidoAtual = {
  itens: [],
  pagamento: 'Pix',
  nome: '',
};

function obterCarrinho() {
  const carrinho = lerDados(CHAVES.carrinho, { itens: [], nome: '', pagamento: 'Pix' });
  if (!carrinho || !Array.isArray(carrinho.itens)) {
    return { itens: [], nome: '', pagamento: 'Pix' };
  }
  return {
    itens: carrinho.itens.filter((i) => i && SABORES.some((s) => s.id === i.sabor) && i.quantidade > 0),
    nome: typeof carrinho.nome === 'string' ? carrinho.nome : '',
    pagamento: FORMAS_PAGAMENTO.includes(carrinho.pagamento) ? carrinho.pagamento : 'Pix',
  };
}

function salvarCarrinho() {
  gravarDados(CHAVES.carrinho, pedidoAtual);
  atualizarTr();
}

function calcularTotal(itens) {
  return (itens || []).reduce(
    (soma, item) => soma + item.quantidade * obterSabor(item.sabor).preco,
    0
  );
}

function obterSabor(id) {
  return SABORES.find((s) => s.id === id);
}

function proximoNumeroPedido() {
  const atual = Number(lerDados(CHAVES.proximoNumero, 1));
  gravarDados(CHAVES.proximoNumero, atual + 1);
  return atual;
}

/* ------------------------- Views ------------------------- */
const visao = document.getElementById('app');

function renderizarMenu() {
  const carrinho = obterCarrinho();
  visao.innerHTML = `
    <div class="slogan">
      <div class="grito">NOVIDADE! ESPETINHOS!</div>
      <div class="chip">escolha e peça aqui</div>
    </div>
    <ul class="menu-sabores" id="menu-sabores" style="list-style:none; padding:0; margin:0">
      ${SABORES.map(
        (sabor) => {
          const item = carrinho.itens.find((i) => i.sabor === sabor.id);
          const qtd = item ? item.quantidade : 0;
          return `
          <li class="card-sabor">
            <div class="arte-espeto" aria-hidden="true">${sabor.emoji}</div>
            <div class="info">
              <h2>${sabor.nome}</h2>
              <p class="desc">${sabor.descricao}</p>
              <span class="preco">${fmoeda(sabor.preco)}</span>
              <div class="acoes-sabor">
                <div class="qtd-control">
                  <button class="btn-qtd btn-menos" data-sabor="${sabor.id}" data-delta="-1"
                    aria-label="Remover 1 espetinho de ${sabor.nome}">−</button>
                  <span class="qtd-valor" id="qtd-${sabor.id}" aria-live="polite">${qtd}</span>
                  <button class="btn-qtd btn-mais" data-sabor="${sabor.id}" data-delta="1"
                    aria-label="Adicionar 1 espetinho de ${sabor.nome}">+</button>
                </div>
                <div class="sub-observacao">
                  <label for="obs-${sabor.id}">Observação</label>
                  <input id="obs-${sabor.id}" class="observacao-input" type="text"
                    placeholder="Ex.: bem passado, sem sal..." maxlength="120"
                    value="${item && item.observacao ? escaparHTML(item.observacao) : ''}"
                    data-sabor="${sabor.id}">
                </div>
              </div>
            </div>
          </li>`;
        }
      ).join('')}
    </ul>`;

  document.querySelectorAll('.btn-qtd').forEach((botao) => {
    botao.addEventListener('click', () => {
      const sabor = botao.dataset.sabor;
      const delta = Number(botao.dataset.delta);
      alterarQuantidade(sabor, delta);
    });
  });

  document.querySelectorAll('.observacao-input').forEach((campo) => {
    campo.addEventListener('change', () => {
      const carrinho2 = obterCarrinho();
      const item = carrinho2.itens.find((i) => i.sabor === campo.dataset.sabor);
      if (item) {
        item.observacao = campo.value.trim().slice(0, 120);
        pedidoAtual = carrinho2;
        salvarCarrinho();
      }
    });
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[caractere]));
}

function alterarQuantidade(sabor, delta) {
  let carrinho = obterCarrinho();
  let item = carrinho.itens.find((i) => i.sabor === sabor);
  if (!item) {
    item = { sabor, quantidade: 0, observacao: '' };
    carrinho.itens.push(item);
  }
  item.quantidade = Math.max(0, item.quantidade + delta);
  if (item.quantidade === 0) {
    carrinho.itens = carrinho.itens.filter((i) => i.sabor !== sabor);
  }
  carrinho.itens = carrinho.itens.filter((i) => i.quantidade > 0);
  pedidoAtual = carrinho;
  salvarCarrinho();
  // Atualiza apenas o número na tela, sem re-renderizar (evita perder foco do input)
  const itemRenderizado = carrinho.itens.find((i) => i.sabor === sabor);
  const elementoQtd = document.getElementById('qtd-' + sabor);
  if (elementoQtd) elementoQtd.textContent = itemRenderizado ? itemRenderizado.quantidade : 0;
  if ('vibrate' in navigator) navigator.vibrate?.(15);
}

/* --------------------- Barra inferior -------------------- */
function atualizarTr() {
  const carrinho = obterCarrinho();
  const total = calcularTotal(carrinho.itens);
  const quantidade = carrinho.itens.reduce((soma, i) => soma + i.quantidade, 0);
  document.getElementById('carrinho-qtd').textContent = String(quantidade);
  document.getElementById('carrinho-total').textContent = fmoeda(total);
  document.getElementById('btn-carrinho').disabled = quantidade === 0;
}

/* ---------------------- Modal do carrinho ---------------- */
function abrirCarrinho() {
  const carrinho = obterCarrinho();
  const total = calcularTotal(carrinho.itens);
  const linhas = carrinho.itens
    .map((item) => {
      const sabor = obterSabor(item.sabor);
      return `
      <div class="item-linha">
        <div>
          <div class="qtd-unit">${item.quantidade}× ${sabor.emoji} ${sabor.nome}</div>
          ${item.observacao ? `<div class="obs-item">Obs.: ${escaparHTML(item.observacao)}</div>` : ''}
          <div class="item-controles">
            <button class="btn-mini" data-sabor="${item.sabor}" data-delta="-1" aria-label="Remover 1">−</button>
            <span style="align-self:center; font-weight:800">${item.quantidade}</span>
            <button class="btn-mini" data-sabor="${item.sabor}" data-delta="1" aria-label="Adicionar 1">+</button>
            <button class="btn-mini remover" data-sabor="${item.sabor}" data-remover="1" aria-label="Remover item">✕</button>
          </div>
        </div>
        <div class="sub-valor">${fmoeda(item.quantidade * sabor.preco)}</div>
      </div>`;
    })
    .join('');

  exibirModal(`
    <h2><span class="span-vermelho">Seu pedido</span></h2>
    ${linhas}
    <div class="total-linha"><span>Total</span><span class="grande">${fmoeda(total)}</span></div>
    <div class="acoes-modal">
      <button class="btn btn-vermelho" id="btn-continuar">Continuar →</button>
      <button class="btn btn-escuro" id="btn-adicionar-mais">+ Adicionar mais</button>
    </div>
  `);

  document.querySelectorAll('.btn-mini').forEach((botao) => {
    botao.addEventListener('click', () => {
      const sabor = botao.dataset.sabor;
      if (botao.dataset.remover) {
        let c = obterCarrinho();
        c.itens = c.itens.filter((i) => i.sabor !== sabor);
        pedidoAtual = c;
        salvarCarrinho();
        fecharModal();
        renderizarMenu();
        mostrarAviso('Item removido.');
      } else {
        alterarQuantidade(sabor, Number(botao.dataset.delta));
        fecharModal();
        abrirCarrinho();
      }
    });
  });

  document.getElementById('btn-continuar')?.addEventListener('click', abrirCheckout);
  document.getElementById('btn-adicionar-mais')?.addEventListener('click', () => {
    fecharModal();
    renderizarMenu();
  });
}

/* -------------------- Checkout (dados) ------------------- */
function abrirCheckout() {
  const carrinho = obterCarrinho();
  if (carrinho.itens.length === 0) { fecharModal(); return; }
  const total = calcularTotal(carrinho.itens);

  exibirModal(`
    <h2><span class="span-vermelho">Finalizar</span></h2>
    <div class="campo-form">
      <label for="campo-nome">Seu nome (opcional)</label>
      <input id="campo-nome" type="text" placeholder="Como te chamamos?" maxlength="60"
        value="${escaparHTML(carrinho.nome)}" autocomplete="name">
    </div>
    <div class="campo-form">
      <label>Forma de pagamento</label>
      <div class="opcoes-pagamento" role="radiogroup" aria-label="Forma de pagamento">
        ${FORMAS_PAGAMENTO.map(
          (forma) => `
          <button class="opcao-pag ${forma === carrinho.pagamento ? 'selecionada' : ''}"
            data-forma="${forma}" role="radio" aria-checked="${forma === carrinho.pagamento}">${forma}</button>`
        ).join('')}
      </div>
    </div>
    <div class="total-linha"><span>Total</span><span class="grande">${fmoeda(total)}</span></div>
    <div class="acoes-modal">
      <button class="btn btn-vermelho" id="btn-confirmar">Confirmar pedido ✓</button>
      <button class="btn btn-escuro" id="btn-voltar-carrinho">← Voltar</button>
    </div>
  `);

  document.querySelectorAll('.opcao-pag').forEach((botao) => {
    botao.addEventListener('click', () => {
      let c = obterCarrinho();
      c.pagamento = botao.dataset.forma;
      pedidoAtual = c;
      salvarCarrinho();
      document.querySelectorAll('.opcao-pag').forEach((b) => {
        const selecionado = b === botao;
        b.classList.toggle('selecionada', selecionado);
        b.setAttribute('aria-checked', String(selecionado));
      });
    });
  });

  const campoNome = document.getElementById('campo-nome');
  campoNome.addEventListener('change', () => {
    let c = obterCarrinho();
    c.nome = campoNome.value.trim().slice(0, 60);
    pedidoAtual = c;
    salvarCarrinho();
  });

  document.getElementById('btn-voltar-carrinho').addEventListener('click', abrirCarrinho);
  document.getElementById('btn-confirmar').addEventListener('click', confirmarPedido);
}

/* -------------------- Confirmação ----------------------- */
async function confirmarPedido() {
  const carrinho = obterCarrinho();
  if (carrinho.itens.length === 0) return;
  if (carrinho.pagamento !== 'Pix' && carrinho.pagamento !== 'Dinheiro') {
    mostrarAviso('Escolha Pix ou Dinheiro.');
    return;
  }

  const botao = document.getElementById('btn-confirmar');
  botao.disabled = true;
  botao.textContent = 'Enviando...';

  const total = calcularTotal(carrinho.itens);
  const itensBackend = carrinho.itens.map((i) => ({
    sabor: i.sabor,
    quantidade: i.quantidade,
    observacao: i.observacao,
  }));

  try {
    // Envia ao backend (banco Postgres)
    const resposta = await chamarAPI('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        nome: carrinho.nome,
        pagamento: carrinho.pagamento,
        itens: itensBackend,
      }),
    });
    finalizarPedido(resposta, carrinho, total, true);
  } catch (erro) {
    console.warn('[rasec] backend indisponível, salvando localmente:', erro);
    mostrarAviso('Sem conexão com a caixa — pedido salvo no aparelho.');
    finalizarPedido(null, carrinho, total, false);
  }
}

function finalizarPedido(resposta, carrinho, total, remoto) {
  const numero = resposta ? Number(resposta.numero) : proximoNumeroPedido();
  const hora = resposta?.criado_em || new Date().toISOString();
  const horaEstimada = new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });

  const pedido = {
    numero,
    total,
    nome: carrinho.nome,
    pagamento: carrinho.pagamento,
    hora,
    horaEstimadaRetirada: horaEstimada,
    status: 'Pendente',
    remoto,
    itens: carrinho.itens.map((i) => ({ ...i })),
  };

  // Histórico de pedidos com limite de 200 para proteger a quota
  let historico = lerDados(CHAVES.pedidos, []);
  if (!Array.isArray(historico)) historico = [];
  historico.push(pedido);
  if (historico.length > 200) historico = historico.slice(-200);
  gravarDados(CHAVES.pedidos, historico);

  // Limpa o carrinho ativo
  pedidoAtual = { itens: [], pagamento: 'Pix', nome: '' };
  try { localStorage.removeItem(CHAVES.carrinho); } catch (_) { /* ignora */ }
  atualizarTr();

  const linhasResumo = carrinho.itens
    .map((item) => {
      const sabor = obterSabor(item.sabor);
      return `<div class="linha-resumo"><span>${item.quantidade}× ${sabor.emoji} ${sabor.nome}</span>
        <span>${fmoeda(item.quantidade * sabor.preco)}</span></div>`;
    })
    .join('');

  exibirModal(`
    <h2><span class="span-vermelho">Pedido #${String(numero).padStart(3, '0')}</span></h2>
    <div class="resumo-confirmado">
      ${linhasResumo}
      <div class="linha-resumo" style="margin-top:8px"><strong>Total</strong><strong>${fmoeda(total)}</strong></div>
    </div>
    ${remoto ? '' : '<p class="aviso-offline">⚠ Pedido salvo apenas neste aparelho (sem conexão).</p>'}
    ${carrinho.pagamento === 'Pix'
      ? `<div class="bloco-pix">
           <p style="font-weight:800; margin:0 0 6px">Pague com o QR Code abaixo:</p>
           <div class="qrcode-sku"><img src="${API_BASE}api/pix/qr.png?valor=${total.toFixed(2)}"
             alt="QR Code Pix de ${fmoeda(total)}" width="260" height="260"></div>
           <button class="btn btn-escuro" id="btn-copiar-pix">Copiar código Pix</button>
           <p style="font-size:.85rem; opacity:.8; margin:8px 0 0">
             Depois de pagar, <strong>apresente o comprovante</strong> no caixa.</p>
         </div>`
      : `<p style="font-weight:700">Pagamento: Dinheiro — favore o troco pensando bem.</p>`}
    <p style="margin:10px 0 0">Previsão de retirada: <strong>${horaEstimada}</strong></p>
    <div class="acoes-modal">
      <button class="btn btn-creme" id="btn-acompanhar">Acompanhar meu pedido</button>
      <button class="btn btn-vermelho" id="btn-novo-pedido">Fazer outro pedido</button>
    </div>
  `);

  if ('vibrate' in navigator) navigator.vibrate?.([60, 40, 60]);
  document.getElementById('btn-acompanhar').addEventListener('click', abrirStatus);
  document.getElementById('btn-novo-pedido').addEventListener('click', () => {
    fecharModal();
    renderizarMenu();
  });
  if (carrinho.pagamento === 'Pix') {
    document.getElementById('btn-copiar-pix')?.addEventListener('click', async () => {
      try {
        const dados = await chamarAPI('/api/pix/payload?valor=' + total.toFixed(2));
        await navigator.clipboard.writeText(dados.payload);
        mostrarAviso('Código Pix copiado!');
      } catch (_) {
        mostrarAviso('Não foi possível copiar. Use o QR Code.');
      }
    });
  }
}

/* -------------------- Acompanhamento -------------------- */
const STATUS_ORDEM = ['Pendente', 'Em preparo', 'Pronto'];

async function abrirStatus() {
  const historico = lerDados(CHAVES.pedidos, []);
  const meusPedidos = historico.slice(-5).reverse();

  // Atualiza os status dos pedidos que estão no banco de dados
  await Promise.allSettled(
    meusPedidos.filter((p) => p.remoto).map(async (p) => {
      const dados = await chamarAPI('/api/pedidos/numero/' + p.numero);
      p.status = dados.status;
    })
  );
  gravarDados(CHAVES.pedidos, historico);

  const linhas = meusPedidos
    .map(
      (pedido) => `
    <div class="item-linha" style="grid-template-columns: 1fr auto;">
      <div>
        <div class="nome-item">Pedido #${String(pedido.numero).padStart(3, '0')}</div>
        <div class="obs-item">${(pedido.itens || [])
          .map((i) => `${i.quantidade}× ${obterSabor(i.sabor).nome}`)
          .join(', ')} · ${pedido.pagamento}</div>
        <div style="margin-top:6px">
          <span style="font-weight:800; font-size:.8rem; padding:4px 10px; border-radius:999px;
            background:${pedido.status === 'Pronto' ? 'var(--verde)' : pedido.status === 'Em preparo' ? 'var(--amarelo)' : 'rgba(23,19,16,.15)'}">
            ${pedido.status}
          </span>
        </div>
      </div>
      <div class="sub-valor">${fmoeda(pedido.total)}</div>
    </div>`
    )
    .join('');

  exibirModal(`
    <h2><span class="span-vermelho">Meus pedidos</span></h2>
    ${linhas || '<p>Nenhum pedido registrado ainda. Faça o primeiro! 🍢</p>'}
    <div class="acoes-modal">
      <button class="btn btn-escuro" id="btn-fechar-status">Fechar</button>
    </div>
  `);

  document.getElementById('btn-fechar-status').addEventListener('click', fecharModal);
}

/* ------------------------ Modal -------------------------- */
let modalFundoAtual = null;

function exibirModal(html) {
  fecharModal();
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');
  const caixa = document.createElement('div');
  caixa.className = 'modal-caixa';
  caixa.innerHTML = html;
  fundo.appendChild(caixa);
  fundo.addEventListener('click', (ev) => {
    if (ev.target === fundo) fecharModal();
  });
  document.body.appendChild(fundo);
  modalFundoAtual = fundo;
  caixa.focus?.();
}

function fecharModal() {
  if (modalFundoAtual) {
    modalFundoAtual.remove();
    modalFundoAtual = null;
  }
}

/* ------------------------ Toast -------------------------- */
let temporizadorToast = null;

function mostrarAviso(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.add('visivel');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visivel'), 2600);
}

/* ------------------- PWA: instalação --------------------- */
let promptInstalacao = null;

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  promptInstalacao = evento;
  const botao = document.getElementById('btn-instalar');
  if (lerDados(CHAVES.instalado, false) !== true) botao.hidden = false;
});

window.addEventListener('appinstalled', () => {
  gravarDados(CHAVES.instalado, true);
  document.getElementById('btn-instalar').hidden = true;
  promptInstalacao = null;
});

document.getElementById('btn-instalar').addEventListener('click', async () => {
  if (!promptInstalacao) return;
  promptInstalacao.prompt();
  const escolha = await promptInstalacao.userChoice;
  if (escolha?.outcome === 'accepted') {
    gravarDados(CHAVES.instalado, true);
    document.getElementById('btn-instalar').hidden = true;
  }
  promptInstalacao = null;
});

/* ------------------- Inicialização ------------------------ */
document.getElementById('btn-carrinho').addEventListener('click', abrirCarrinho);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((erro) => {
      console.warn('[rasec] falha ao registrar service worker:', erro);
    });
  });
}

renderizarMenu();
atualizarTr();
