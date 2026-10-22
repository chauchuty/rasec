/* Painel administrativo — RASEC Espetinhos
   Login, pedidos pendentes (atualização automática) e relatórios. */
'use strict';

/* ------------------------- Config ------------------------- */
// Caminho relativo funciona com Rewrite do Render e proxy do dev.
// Opcional: definir window.RASEC_API_BASE antes deste script.
const API_BASE = window.RASEC_API_BASE || './';

const NOME_SABOR = { carne: 'Carne', frango: 'Frango', linguica: 'Linguiça' };
const EMOJI_SABOR = { carne: '🥩', frango: '🍗', linguica: '🌭' };
const PROXIMO_STATUS = {
  'Pendente': 'Em preparo',
  'Em preparo': 'Pronto',
  'Pronto': 'Entregue',
};

const fmoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function chamarAPI(caminho, opcoes = {}) {
  const resposta = await fetch(API_BASE + caminho, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opcoes,
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${resposta.status}`);
  }
  return resposta.json();
}

/* ------------------------- Toast --------------------------- */
let toastTimer = null;
function aviso(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visivel'), 2600);
}

/* ------------------------- Login --------------------------- */
document.getElementById('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erro = document.getElementById('erro-login');
  erro.hidden = true;
  try {
    await chamarAPI('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ senha: document.getElementById('campo-senha').value }),
    });
    document.getElementById('campo-senha').value = '';
    abrirPainel();
  } catch {
    erro.hidden = false;
  }
});

document.getElementById('btn-sair').addEventListener('click', async () => {
  await chamarAPI('/api/admin/logout', { method: 'POST' }).catch(() => null);
  location.reload();
});

/* ------------------- Painel / navegação -------------------- */
let filtroAtual = '';
let temporizadorAtualizacao = null;

const elPedidos = document.getElementById('lista-pedidos');
const elBadge = document.getElementById('badge-pendentes');
const conexaoEl = document.getElementById('conexao');

function setarConexao(ok) {
  conexaoEl.classList.toggle('ok', ok);
  conexaoEl.classList.toggle('falha', !ok);
  conexaoEl.textContent = ok ? 'Conectado ao banco' : 'Backend offline';
}

async function abrirPainel() {
  document.getElementById('tela-login').hidden = true;
  document.getElementById('tela-painel').hidden = false;
  document.getElementById('btn-sair').hidden = false;
  atualizarPedidos();
  // Atualização automática: ajuda a cozinha sem recarregar manualmente
  clearInterval(temporizadorAtualizacao);
  temporizadorAtualizacao = setInterval(atualizarPedidos, 15000);
}

/* ----------------------- Pedidos --------------------------- */
document.querySelectorAll('.filtro').forEach((botao) => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.filtro').forEach((b) => b.classList.remove('ativa'));
    botao.classList.add('ativa');
    filtroAtual = botao.dataset.status;
    atualizarPedidos();
  });
});

async function atualizarPedidos() {
  try {
    const url = '/api/admin/pedidos' + (filtroAtual ? `?status=${encodeURIComponent(filtroAtual)}` : '?limite=50');
    const lista = await chamarAPI(url);
    setarConexao(true);
    renderizarPedidos(lista);
  } catch (erro) {
    setarConexao(false);
    if (erro.message.includes('401')) {
      clearInterval(temporizadorAtualizacao);
      location.reload();
      return;
    }
    elPedidos.innerHTML = '<p class="vazio">Sem conexão com o servidor.</p>';
  }
}

function renderizarPedidos(pedidos) {
  const pendentes = pedidos.filter((p) => p.status === 'Pendente').length;
  elBadge.textContent = pendentes > 0 ? String(pendentes) : '';

  if (pedidos.length === 0) {
    elPedidos.innerHTML = `<p class="vazio">Nenhum pedido ${filtroAtual ? `“${filtroAtual}”` : ''} por aqui. 🍢</p>`;
    return;
  }

  elPedidos.innerHTML = pedidos.map((pedido) => {
    const proximo = PROXIMO_STATUS[pedido.status];
    const classeStatus = pedido.status === 'Em preparo' ? 'EmPreparo' : pedido.status === 'Pronto' ? 'Pronto' : '';
    const hora = new Date(pedido.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `
    <article class="cartao-pedido" data-id="${pedido.id}">
      <div class="cabecalho-pedido">
        <span class="numero-pedido">#${String(pedido.numero).padStart(3, '0')}</span>
        <span class="tag-status ${classeStatus}">${pedido.status}</span>
      </div>
      <div class="meta-pedido">
        ${pedido.nome ? `${pedido.nome} · ` : ''}${pedido.pagamento} · ${hora}
      </div>
      <ul class="itens-pedido">
        ${(pedido.itens || []).map((i) => `
          <li>
            <span>${i.quantidade}× ${EMOJI_SABOR[i.sabor]} ${NOME_SABOR[i.sabor]}
              ${i.observacao ? `<div class="obs">Obs.: ${escapar(i.observacao)}</div>` : ''}</span>
            <strong>${fmoeda(i.quantidade * Number(i.preco_unit))}</strong>
          </li>`).join('')}
      </ul>
      <div class="rodape-pedido">
        <span class="total-pedido">${fmoeda(pedido.total)}</span>
        ${proximo
          ? `<button class="btn-status avancar" data-id="${pedido.id}" data-status="${proximo}">
               Avançar → ${proximo}</button>`
          : '<span class="meta-pedido">✔ Finalizado</span>'}
      </div>
    </article>`;
  }).join('');

  elPedidos.querySelectorAll('.btn-status').forEach((botao) => {
    botao.addEventListener('click', () => avancarStatus(botao));
  });
}

async function avancarStatus(botao) {
  botao.disabled = true;
  try {
    const r = await chamarAPI(`/api/admin/pedidos/${botao.dataset.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: botao.dataset.status }),
    });
    if ('vibrate' in navigator) navigator.vibrate?.(20);
    aviso(`Pedido #${String(r.numero).padStart(3, '0')} → ${r.status}`);
    atualizarPedidos();
  } catch (erro) {
    botao.disabled = false;
    aviso('Falha ao atualizar: ' + erro.message);
  }
}

/* ---------------------- Relatórios ------------------------- */
function escapar(texto) {
  return String(texto).replace(/[&<>\"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const fmtData = (d) => d.toISOString().slice(0, 10);

document.getElementById('rel-de').value = fmtData(new Date(Date.now() - 7 * 864e5));
document.getElementById('rel-ate').value = fmtData(new Date());

document.querySelectorAll('.aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((a) => a.classList.remove('ativa'));
    aba.classList.add('ativa');
    const relatorios = aba.dataset.aba === 'relatorios';
    document.getElementById('painel-pedidos').hidden = relatorios;
    document.getElementById('painel-relatorios').hidden = !relatorios;
    if (relatorios) gerarRelatorio();
  });
});

document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorio);

async function gerarRelatorio() {
  const conteudo = document.getElementById('relatorio-conteudo');
  const de = document.getElementById('rel-de').value;
  const ate = document.getElementById('rel-ate').value;
  conteudo.innerHTML = '<p class="vazio">Gerando…</p>';
  try {
    const r = await chamarAPI(`/api/admin/relatorios?de=${de}&ate=${ate}`);
    const resumo = r.resumo;
    conteudo.innerHTML = `
      <div class="cartao-metrica">
        <h3>Resumo do período</h3>
        <div class="grade-metricas">
          <div class="metrica"><strong>${resumo.total_pedidos}</strong><span>Pedidos</span></div>
          <div class="metrica"><strong>${fmoeda(resumo.faturamento)}</strong><span>Faturamento</span></div>
          <div class="metrica"><strong>${resumo.pag_pix}</strong><span>Pagamentos Pix</span></div>
          <div class="metrica"><strong>${resumo.pag_dinheiro}</strong><span>Pagamentos Dinheiro</span></div>
          <div class="metrica"><strong>${resumo.pendentes}</strong><span>Pendentes</span></div>
          <div class="metrica"><strong>${resumo.entregues}</strong><span>Entregues</span></div>
        </div>
      </div>
      <div class="cartao-metrica">
        <h3>Por sabor</h3>
        ${r.porSabores.length ? `
        <table class="tabela-rel">
          <tr><th>Sabor</th><th>Quantidade</th><th>Receita</th></tr>
          ${r.porSabores.map((s) => `
            <tr><td>${EMOJI_SABOR[s.sabor]} ${NOME_SABOR[s.sabor]}</td>
                <td>${s.quantidade}</td><td>${fmoeda(s.receita)}</td></tr>`).join('')}
        </table>` : '<p class="vazio">Sem vendas no período.</p>'}
      </div>
      <div class="cartao-metrica">
        <h3>Últimos dias</h3>
        ${r.porDia.length ? `
        <table class="tabela-rel">
          <tr><th>Dia</th><th>Pedidos</th><th>Faturamento</th></tr>
          ${r.porDia.map((d) => `
            <tr><td>${new Date(d.dia).toLocaleDateString('pt-BR')}</td>
                <td>${d.pedidos}</td><td>${fmoeda(d.faturamento)}</td></tr>`).join('')}
        </table>` : '<p class="vazio">Sem dados.</p>'}
      </div>`;
  } catch (erro) {
    conteudo.innerHTML = `<p class="vazio">Falha: ${escapar(erro.message)}</p>`;
  }
}

/* -------------------- Sessão verificada -------------------- */
// Se já há cookie de sessão válido, abre direto o painel
(async () => {
  try {
    await chamarAPI('/api/admin/pedidos?limite=1');
    setarConexao(true);
    abrirPainel();
  } catch (erro) {
    if (String(erro.message).includes('401')) {
      setarConexao(true); // banco ok, apenas sem sessão
    } else {
      setarConexao(false);
    }
  }
})();

if ('serviceWorker' in navigator) { /* painel não precisa de SW */ }
