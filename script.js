  /* =====================================================================
   GAS-SHIM PARA VERCEL
   Mapeia google.script.run para a Serverless Function /api/gas
   ===================================================================== */
window.google = {
  script: {
    run: new Proxy({}, {
      get: function(target, functionName) {
        let successHandler = function() {};
        let failureHandler = function(err) { console.error("Erro no Shim:", err); };

        // O runner é a função que será de fato executada (ex: getBootstrap())
        const runner = function(...args) {
          fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ functionName: functionName, args: args })
          })
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              failureHandler(data.error);
            } else {
              successHandler(data.result);
            }
          })
          .catch(err => failureHandler(err));
        };

        // Permite o encadeamento idêntico ao do Google Apps Script
        runner.withSuccessHandler = function(callback) {
          successHandler = callback;
          return runner;
        };
        
        runner.withFailureHandler = function(callback) {
          failureHandler = callback;
          return runner;
        };

        return runner;
      }
    })
  }
};

/* =====================================================================
   GPE — Cadastro de Profissionais da Educação — lógica do cliente
   ===================================================================== */

// ---------------------------------------------------------------------
// ESTADO E CONFIGURAÇÃO DAS ETAPAS
// ---------------------------------------------------------------------
const ETAPAS = [
  { id: 0, label: 'Escola' },
  { id: 1, label: 'Dados pessoais' },
  { id: 2, label: 'Endereço' },
  { id: 3, label: 'Deficiências' },
  { id: 4, label: 'Formação acadêmica' },
  { id: 5, label: 'Vínculo' },
  { id: 6, label: 'Revisão' }
];

const CAMPOS_OBRIGATORIOS_POR_ETAPA = {
  1: ['PROFISSIONAL_CPF', 'PROFISSIONAL_NOME', 'PROFISSIONAL_DT_NASCIMENTO', 'PROFISSIONAL_SEXO',
      'PROFISSIONAL_RACA_COR', 'PROFISSIONAL_QUILOMBOLA', 'PROFISSIONAL_NACIONALIDADE',
      'PROFISSIONAL_PAIS_NASCIMENTO', 'PROFISSIONAL_ESTADO_NASCIMENTO', 'PROFISSIONAL_MUNICIPIO_NASCIMENTO',
      'PROFISSIONAL_TELEFONE', 'PROFISSIONAL_E_MAIL', 'CO_NIVEL_ESCOLARIDADE'],
  2: ['PROFISSIONAL_CO_UF_RES', 'PROFISSIONAL_CO_MUNICIPIO_RES'],
  3: ['PROFISSIONAL_DEFICIENCIA'],
  4: [], // tratado à parte (condicional)
  5: ['CO_TIPO_VINCULO', 'SITUACAO_VINCULO_PROFISSIONAL_REDE', 'DATA_INICIO_VINCULO_PROFISSIONAL_REDE',
      'CO_FUNCAO', 'DATA_INGRESSO', 'AREA_CONHECIMENTO_VINCULO_PROFISSIONAL']
};

const CAMPOS_FORMACAO_CONDICIONAL = ['CO_TIPO_FORMACAO_ACADEMICA', 'CO_AREA_DO_CONHECIMENTO_FORMACAO_ACADEMICA'];
const NIVEIS_QUE_EXIGEM_FORMACAO = ['7', '8', '9', '10'];

const MAPA_DOMINIO = {
  PROFISSIONAL_SEXO: 'SEXO',
  PROFISSIONAL_GENERO: 'GENERO',
  PROFISSIONAL_RACA_COR: 'RACA_COR',
  PROFISSIONAL_QUILOMBOLA: 'QUILOMBOLA',
  PROFISSIONAL_NACIONALIDADE: 'NACIONALIDADE',
  PROFISSIONAL_PAIS_NASCIMENTO: 'PAIS_NASCIMENTO',
  PROFISSIONAL_ESTADO_NASCIMENTO: 'ESTADOS',
  CO_NIVEL_ESCOLARIDADE: 'NIVEL_ESCOLARIDADE',
  CO_TIPO_ENSINO_MEDIO: 'TIPO_ENSINO_MEDIO',
  NATUREZA_INSTITUICAO_MEDIO_PROFISSIONAL: 'NATUREZA_INSTITUICAO',
  PROFISSIONAL_CO_UF_RES: 'ESTADOS',
  PROFISSIONAL_LOCALIZACAO_GEOGRAFICA: 'LOCALIZACAO_GEOGRAFICA',
  PROFISSIONAL_LOCALIZACAO_DIFERENCIADA: 'LOCALIZACAO_DIFERENCIADA',
  CO_TIPO_FORMACAO_ACADEMICA: 'TIPO_FORMACAO_ACADEMICA',
  CO_AREA_DO_CONHECIMENTO_FORMACAO_ACADEMICA: 'AREA_CONHECIMENTO',
  NATUREZA_INSTITUICAO_FORMACAO_ACADEMICA: 'NATUREZA_INSTITUICAO',
  CO_TIPO_VINCULO: 'TIPO_VINCULO',
  CO_PROFISSIONAL_PERFIL_VINCULO: 'PERFIL_VINCULO',
  SITUACAO_VINCULO_PROFISSIONAL_REDE: 'SITUACAO_VINCULO',
  CO_FUNCAO: 'FUNCAO',
  AREA_CONHECIMENTO_VINCULO_PROFISSIONAL: 'AREA_CONHECIMENTO'
};

// combobox de município -> qual select de UF/Estado deve filtrar a lista
const MAPA_MUNICIPIO_PARA_UF = {
  PROFISSIONAL_MUNICIPIO_NASCIMENTO: 'PROFISSIONAL_ESTADO_NASCIMENTO',
  PROFISSIONAL_CO_MUNICIPIO_RES: 'PROFISSIONAL_CO_UF_RES'
};

let bootstrap = null;

// --- NOVAS VARIÁVEIS PARA A API DO IBGE ---
const cacheMunicipiosIBGE = {}; // Guarda os municípios já carregados por estado

// --- NOVA FUNÇÃO QUE BUSCA NA API DO IBGE ---
async function carregarMunicipiosDaUF(ufId) {
  if (!ufId) return [];
  // Se já buscamos este estado antes, retorna do cache instantaneamente
  if (cacheMunicipiosIBGE[ufId]) return cacheMunicipiosIBGE[ufId];

  try {
    // A API do IBGE aceita diretamente o código numérico do estado (ex: 29 para BA)
    const url = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + ufId + '/municipios';
    const res = await fetch(url);
    const dados = await res.json();
    
    // Formata para o padrão esperado pelo seu sistema
    const formatado = dados.map(m => ({
      uf: ufId,
      codigo: m.id.toString(), // Código IBGE de 7 dígitos
      nome: m.nome.toUpperCase()
    }));
    
    // Ordena alfabeticamente
    formatado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    
    // Salva no cache
    cacheMunicipiosIBGE[ufId] = formatado;
    return formatado;
  } catch (erro) {
    console.error("Erro ao buscar municípios no IBGE:", erro);
    exibirToast("Erro ao carregar cidades do IBGE. Verifique sua conexão.", "erro");
    return [];
  }
}

let escolaSelecionada = null; // { codigo, nome }
let etapaAtual = 0;
let municipioDestacado = {}; // controla item destacado no teclado por campo

// ---------------------------------------------------------------------
// INICIALIZAÇÃO
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  google.script.run
    .withSuccessHandler(aoCarregarBootstrap)
    .withFailureHandler(function (erro) {
      exibirToast('Não foi possível carregar o formulário: ' + (erro && erro.message ? erro.message : erro), 'erro');
    })
    .getBootstrap();
});

function aoCarregarBootstrap(dados) {
  bootstrap = dados;

  renderizarTrilha();
  renderizarEscolas();
  preencherTodosOsSelects();
  renderizarChipsDeficiencia();
  configurarMascaras();
  configurarCombosMunicipio();
  configurarEventosNavegacao();
  configurarEventosGerais();

  mostrarEtapa(0);
  carregarRascunho(); // Restaura o rascunho se houver

  // NOVO: Força o carregamento dos municípios do IBGE para o estado padrão (Bahia) 
  // ou para o estado que foi restaurado do seu rascunho.
  document.querySelectorAll('[data-campo="PROFISSIONAL_ESTADO_NASCIMENTO"] select, [data-campo="PROFISSIONAL_CO_UF_RES"] select').forEach(function(select) {
     if (select.value) {
        select.dispatchEvent(new Event('change'));
     }
  });

  document.getElementById('tela-carregando').style.opacity = '0';
  setTimeout(function () {
    document.getElementById('tela-carregando').classList.add('oculto');
  }, 400);
}

// ---------------------------------------------------------------------
// TRILHA (NAVEGAÇÃO LATERAL / MOBILE)
// ---------------------------------------------------------------------
function renderizarTrilha() {
  const desktop = document.getElementById('trilha-desktop');
  const mobile = document.getElementById('trilha-mobile');
  desktop.innerHTML = '';
  mobile.innerHTML = '';

  ETAPAS.forEach(function (etapa, i) {
    const item = document.createElement('div');
    item.className = 'trilha__item';
    item.dataset.etapa = etapa.id;
    item.innerHTML = '<span class="trilha__numero">' + (i + 1) + '</span><span class="trilha__label">' + etapa.label + '</span>';
    desktop.appendChild(item);

    const chip = document.createElement('div');
    chip.className = 'trilha-mobile__item';
    chip.dataset.etapa = etapa.id;
    chip.textContent = (i + 1) + '. ' + etapa.label;
    mobile.appendChild(chip);
  });
}

function atualizarTrilha() {
  document.querySelectorAll('#trilha-desktop .trilha__item, #trilha-mobile .trilha-mobile__item').forEach(function (el) {
    const id = Number(el.dataset.etapa);
    el.classList.remove('concluido', 'atual');
    if (id < etapaAtual) el.classList.add('concluido');
    else if (id === etapaAtual) el.classList.add('atual');
  });
  const barra = document.getElementById('barra-progresso');
  const pct = (etapaAtual / (ETAPAS.length - 1)) * 100;
  barra.style.width = Math.min(pct, 100) + '%';
}

// ---------------------------------------------------------------------
// ETAPA 0 — SELEÇÃO DE ESCOLA
// ---------------------------------------------------------------------
function renderizarEscolas() {
  const lista = document.getElementById('lista-escolas');
  lista.innerHTML = '';
  if (!bootstrap.escolas.length) {
    lista.innerHTML = '<p class="ajuda">Nenhuma escola cadastrada ainda. Contate a Secretaria de Educação.</p>';
    return;
  }
  bootstrap.escolas.forEach(function (escola) {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'escola-opcao';
    div.dataset.codigo = escola.codigo;
    div.innerHTML =
      '<span class="escola-opcao__marca"></span>' +
      '<span><span class="escola-opcao__nome">' + escaparHtml(escola.nome) + '</span><br>' +
      '<span class="escola-opcao__codigo">INEP ' + escaparHtml(escola.codigo) + '</span></span>';
    div.addEventListener('click', function () {
      escolaSelecionada = escola;
      document.querySelectorAll('.escola-opcao').forEach(function (o) { o.classList.remove('selecionada'); });
      div.classList.add('selecionada');
      const selo = document.getElementById('selo-escola');
      selo.textContent = escola.nome;
      selo.classList.add('ativo');
    });
    lista.appendChild(div);
  });
}

// ---------------------------------------------------------------------
// PREENCHIMENTO DOS <select> A PARTIR DOS DOMÍNIOS
// ---------------------------------------------------------------------
function preencherTodosOsSelects() {
  Object.keys(MAPA_DOMINIO).forEach(function (campo) {
    const wrapper = document.querySelector('[data-campo="' + campo + '"]');
    if (!wrapper) return;
    const select = wrapper.querySelector('select');
    if (!select) return;
    const opcoes = bootstrap.dominios[MAPA_DOMINIO[campo]] || [];

    // 1. Adiciona opção vazia padrão para forçar a seleção consciente e evitar erros
    const optVazia = document.createElement('option');
    optVazia.value = '';
    optVazia.textContent = 'Selecione...';
    select.appendChild(optVazia);

    if (campo === 'CO_FUNCAO') {
      const grupos = {};
      opcoes.forEach(function (op) {
        const g = op.g || 'Outros';
        if (!grupos[g]) grupos[g] = [];
        grupos[g].push(op);
      });
      Object.keys(grupos).forEach(function (g) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = g;
        grupos[g].forEach(function (op) {
          const opt = document.createElement('option');
          opt.value = op.v; opt.textContent = op.v + '. ' + op.l;
          optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
      });
    } else {
      opcoes.forEach(function (op) {
        const opt = document.createElement('option');
        opt.value = op.v; 
        
        // Remove o número da frente se for Estado (fica visualmente melhor e mais limpo)
        if (MAPA_DOMINIO[campo] === 'ESTADOS') {
          opt.textContent = op.l;
        } else {
          opt.textContent = op.v + '. ' + op.l;
        }
        
        select.appendChild(opt);
      });
    }
    
    // 2. Define Bahia (código 29) como selecionado por padrão nos campos de Estado
    if (MAPA_DOMINIO[campo] === 'ESTADOS') {
      select.value = '29'; 
    }
  });
}

// ---------------------------------------------------------------------
// CHIPS — DEFICIÊNCIA (multi-seleção com exclusividade para "Não possui" / "Não informado")
// ---------------------------------------------------------------------
function renderizarChipsDeficiencia() {
  const container = document.getElementById('chips-deficiencia');
  container.innerHTML = '';
  const opcoes = bootstrap.dominios.DEFICIENCIA || [];
  opcoes.forEach(function (op) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.valor = op.v;
    chip.textContent = op.l;
    chip.addEventListener('click', function () {
      const exclusivo = (op.v === '0' || op.v === '11');
      if (exclusivo) {
        container.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('selecionado'); });
        chip.classList.add('selecionado');
      } else {
        // desmarca as opções exclusivas se alguma específica for escolhida
        container.querySelectorAll('.chip').forEach(function (c) {
          if (c.dataset.valor === '0' || c.dataset.valor === '11') c.classList.remove('selecionado');
        });
        chip.classList.toggle('selecionado');
      }
      const campoWrapper = container.closest('[data-campo]');
      campoWrapper.classList.remove('invalido');
    });
    container.appendChild(chip);
  });
}

// ---------------------------------------------------------------------
// COMBOBOX DE MUNICÍPIO (pesquisável, filtrado por UF quando aplicável)
// ---------------------------------------------------------------------
function configurarCombosMunicipio() {
  document.querySelectorAll('.combo').forEach(function (wrapper) {
    const campo = wrapper.dataset.campo;
    const input = wrapper.querySelector('input');
    const listaEl = wrapper.querySelector('.combo__lista');

    input.addEventListener('input', function () {
      wrapper.dataset.valor = '';
      abrirListaMunicipios(wrapper, campo, input.value);
    });
    
    input.addEventListener('focus', function () {
      abrirListaMunicipios(wrapper, campo, input.value);
    });
    
    document.addEventListener('click', function (ev) {
      if (!wrapper.contains(ev.target)) listaEl.classList.remove('aberta');
    });

    // Quando o Estado for alterado, limpa o município e busca na API do IBGE
    const campoUf = MAPA_MUNICIPIO_PARA_UF[campo];
    if (campoUf) {
      const selectUf = document.querySelector('[data-campo="' + campoUf + '"] select');
      if (selectUf) {
        selectUf.addEventListener('change', async function () {
          input.value = '';
          wrapper.dataset.valor = '';
          const uf = selectUf.value;
          
          if (uf) {
            // Feedback visual enquanto carrega a API
            const placeholderOriginal = input.placeholder;
            input.placeholder = "Carregando cidades...";
            input.disabled = true;
            
            await carregarMunicipiosDaUF(uf);
            
            input.disabled = false;
            input.placeholder = "Digite para buscar...";
          }
        });
      }
    }
  });
}

function abrirListaMunicipios(wrapper, campo, termo) {
  const listaEl = wrapper.querySelector('.combo__lista');
  const campoUf = MAPA_MUNICIPIO_PARA_UF[campo];
  let candidatos = [];

  // Descobre qual estado está selecionado
  let ufSelecionada = '';
  if (campoUf) {
    const selectUf = document.querySelector('[data-campo="' + campoUf + '"] select');
    ufSelecionada = selectUf ? selectUf.value : '';
  }

  // Pega os candidatos do cache do IBGE
  if (ufSelecionada && cacheMunicipiosIBGE[ufSelecionada]) {
    candidatos = cacheMunicipiosIBGE[ufSelecionada];
  }

  const termoBusca = (termo || '').trim().toUpperCase();
  if (termoBusca) {
    // Remove acentos para facilitar a busca do usuário
    const termoSemAcento = termoBusca.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    candidatos = candidatos.filter(function (m) {
       const nomeSemAcento = m.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
       return nomeSemAcento.indexOf(termoSemAcento) !== -1;
    });
  }
  
  candidatos = candidatos.slice(0, 60); // Limita a exibição para não travar a tela

  listaEl.innerHTML = '';
  if (!candidatos.length) {
    listaEl.innerHTML = '<div class="combo__vazio">' + (campoUf && !ufSelecionada ?
      'Selecione o estado primeiro' : 'Nenhum município encontrado') + '</div>';
  } else {
    candidatos.forEach(function (m) {
      const opcao = document.createElement('div');
      opcao.className = 'combo__opcao';
      opcao.textContent = m.nome;
      opcao.addEventListener('click', function () {
        wrapper.querySelector('input').value = m.nome;
        wrapper.dataset.valor = m.codigo; // Código IBGE de 7 dígitos que será salvo na planilha
        listaEl.classList.remove('aberta');
        wrapper.classList.remove('invalido');
      });
      listaEl.appendChild(opcao);
    });
  }
  listaEl.classList.add('aberta');
}

// ---------------------------------------------------------------------
// MÁSCARAS (CPF, telefone, CEP)
// ---------------------------------------------------------------------
function configurarMascaras() {
  document.querySelectorAll('[data-mask]').forEach(function (input) {
    input.addEventListener('input', function () {
      const tipo = input.dataset.mask;
      let d = input.value.replace(/\D/g, '');
      if (tipo === 'cpf') {
        d = d.slice(0, 11);
        input.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      } else if (tipo === 'telefone') {
        d = d.slice(0, 11);
        if (d.length > 10) input.value = d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
        else input.value = d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
      } else if (tipo === 'cep') {
        d = d.slice(0, 8);
        input.value = d.replace(/(\d{5})(\d{0,3})/, '$1-$2');
      }
    });
  });

  // aviso antecipado de duplicidade ao sair do campo CPF
  const inputCpf = document.querySelector('[data-campo="PROFISSIONAL_CPF"] input');
  if (inputCpf) {
    inputCpf.addEventListener('blur', function () {
      const cpf = inputCpf.value.replace(/\D/g, '');
      if (cpf.length === 11 && escolaSelecionada) {
        google.script.run.withSuccessHandler(function (res) {
          if (res && res.duplicado) {
            exibirToast('Este CPF já está cadastrado nesta escola (' + (res.nome || '') + ').', 'erro');
          }
        }).verificarDuplicidade(cpf, escolaSelecionada.codigo);
      }
    });
  }
}

// ---------------------------------------------------------------------
// NAVEGAÇÃO ENTRE ETAPAS
// ---------------------------------------------------------------------
function configurarEventosNavegacao() {
  document.getElementById('btn-avancar').addEventListener('click', function () {
    if (!validarEtapaAtual()) return;
    if (etapaAtual < ETAPAS.length - 1) mostrarEtapa(etapaAtual + 1);
  });
  
  document.getElementById('btn-voltar').addEventListener('click', function () {
    if (etapaAtual > 0) mostrarEtapa(etapaAtual - 1);
  });
  
  // CORREÇÃO AQUI: Adicionando o evento de clique ao botão "Confirmar e enviar"
  const btnEnviar = document.getElementById('btn-enviar');
  if (btnEnviar) {
    btnEnviar.addEventListener('click', function () {
      enviarCadastro();
    });
  }
  
  // Mantemos o evento antigo do formulário por segurança (caso apertem 'Enter' em algum campo)
  const formCadastro = document.getElementById('form-cadastro');
  if (formCadastro) {
    formCadastro.addEventListener('submit', function (ev) {
      ev.preventDefault();
      // Não chamamos enviarCadastro() aqui pois só queremos enviar na última tela
    });
  }

  // A correção que fizemos antes para o botão de novo cadastro
  const btnNovoCadastro = document.getElementById('btn-novo-cadastro');
  if (btnNovoCadastro) {
    btnNovoCadastro.addEventListener('click', function () {
      location.reload();
    });
  }
}

function configurarEventosGerais() {
  document.querySelectorAll('#trilha-desktop .trilha__item').forEach(function (item) {
    item.addEventListener('click', function () {
      const id = Number(item.dataset.etapa);
      if (id <= etapaAtual || item.classList.contains('concluido')) mostrarEtapa(id);
    });
    item.style.cursor = 'pointer';
  });

  // CORREÇÃO: Salva o rascunho sempre que algo for digitado ou alterado
  document.addEventListener('input', salvarRascunho);
  document.addEventListener('change', salvarRascunho);
  document.addEventListener('click', function(ev) {
    // Salva também ao clicar nos chips de deficiência ou selecionar a escola
    if(ev.target.closest('.chip') || ev.target.closest('.escola-opcao') || ev.target.closest('.combo__opcao')) {
      setTimeout(salvarRascunho, 100);
    }
  });

  // Lógica de Consulta de CPF
  const btnConsultar = document.getElementById('btn-consultar-cpf');
  if (btnConsultar) {
    btnConsultar.addEventListener('click', function() {
      const input = document.getElementById('input-consulta-cpf');
      const cpf = input.value.replace(/\D/g, '');
      const divResultado = document.getElementById('resultado-consulta');
      
      if (cpf.length !== 11) {
        exibirToast('Digite um CPF válido com 11 dígitos.', 'erro');
        return;
      }

      btnConsultar.disabled = true;
      btnConsultar.textContent = 'Buscando...';
      divResultado.classList.add('oculto');
      divResultado.innerHTML = '';

      google.script.run
        .withSuccessHandler(function(res) {
          btnConsultar.disabled = false;
          btnConsultar.textContent = 'Consultar';
          
          if (!res.sucesso) {
            exibirToast(res.mensagem, 'erro');
            return;
          }

          divResultado.classList.remove('oculto');
          if (res.inscricoes.length === 0) {
            divResultado.innerHTML = '<small class="ajuda">Nenhum cadastro encontrado para este CPF.</small>';
          } else {
            let html = '<small class="ajuda" style="color:var(--verde-900); font-weight:600;">Inscrições encontradas:</small>';
            res.inscricoes.forEach(function(insc) {
              html += '<div class="inscricao-card">' +
                        '<strong>' + escaparHtml(insc.escola) + '</strong><br>' +
                        'Protocolo: <span class="mono" style="color:var(--ouro);">' + escaparHtml(insc.protocolo) + '</span><br>' +
                        '<small>Data: ' + escaparHtml(insc.data) + '</small>' +
                      '</div>';
            });
            divResultado.innerHTML = html;
          }
        })
        .withFailureHandler(function(erro) {
          btnConsultar.disabled = false;
          btnConsultar.textContent = 'Consultar';
          exibirToast('Erro ao consultar. Tente novamente.', 'erro');
        })
        .consultarInscricaoPorCPF(cpf);
    });
  }
}

function mostrarEtapa(id) {
  document.querySelectorAll('.etapa-conteudo').forEach(function (s) { s.classList.add('oculto'); });
  const alvo = document.querySelector('.etapa-conteudo[data-etapa="' + id + '"]');
  if (alvo) alvo.classList.remove('oculto');

  etapaAtual = id;
  atualizarTrilha();
  atualizarBotoesNavegacao();

  if (id === 4) atualizarObrigatoriedadeFormacao();
  if (id === 6) montarRevisao();

  document.querySelector('.cartao').scrollIntoView({ behavior: 'smooth', block: 'start' });
  salvarRascunho();
}

function atualizarBotoesNavegacao() {
  const btnVoltar = document.getElementById('btn-voltar');
  const btnAvancar = document.getElementById('btn-avancar');
  const btnEnviar = document.getElementById('btn-enviar');

  btnVoltar.style.visibility = etapaAtual === 0 ? 'hidden' : 'visible';

  if (etapaAtual === 6) {
    btnAvancar.classList.add('oculto');
    btnEnviar.classList.remove('oculto');
  } else {
    btnAvancar.classList.remove('oculto');
    btnEnviar.classList.add('oculto');
  }
}

// ---------------------------------------------------------------------
// FORMAÇÃO ACADÊMICA — OBRIGATORIEDADE CONDICIONAL
// ---------------------------------------------------------------------
function atualizarObrigatoriedadeFormacao() {
  const nivel = document.querySelector('[data-campo="CO_NIVEL_ESCOLARIDADE"] select').value;
  const exige = NIVEIS_QUE_EXIGEM_FORMACAO.indexOf(nivel) !== -1;
  const desc = document.getElementById('formacao-descricao');
  desc.textContent = exige
    ? 'Como o nível de escolaridade informado exige, o tipo de formação e a área do conhecimento são obrigatórios.'
    : 'Dados da formação acadêmica de maior titulação relacionada à atuação prática (opcional para o nível de escolaridade informado).';

  CAMPOS_FORMACAO_CONDICIONAL.forEach(function (campo) {
    const wrapper = document.querySelector('[data-campo="' + campo + '"]');
    const marcador = wrapper.querySelector('.marcador-obrig');
    marcador.textContent = exige ? '*' : '(condicional)';
    marcador.classList.toggle('obrig', exige);
  });
}

// ---------------------------------------------------------------------
// VALIDAÇÃO
// ---------------------------------------------------------------------
function validarEtapaAtual() {
  if (etapaAtual === 0) {
    if (!escolaSelecionada) {
      exibirToast('Selecione uma escola para continuar.', 'erro');
      return false;
    }
    
    // NOVO: Verifica se o checkbox da LGPD está marcado
    const aceiteLgpd = document.getElementById('aceite-lgpd');
    if (aceiteLgpd && !aceiteLgpd.checked) {
      exibirToast('Você precisa aceitar o Termo de Consentimento LGPD para avançar.', 'erro');
      
      // Dá um destaque visual rápido na caixa para chamar atenção
      const boxLgpd = aceiteLgpd.closest('.lgpd-box');
      boxLgpd.style.borderColor = 'var(--erro)';
      setTimeout(function() { boxLgpd.style.borderColor = 'var(--linha)'; }, 1500);
      
      return false;
    }
    
    return true;
  }


  let valido = true;
  const obrigatorios = (CAMPOS_OBRIGATORIOS_POR_ETAPA[etapaAtual] || []).slice();

  if (etapaAtual === 4) {
    const nivel = document.querySelector('[data-campo="CO_NIVEL_ESCOLARIDADE"] select').value;
    if (NIVEIS_QUE_EXIGEM_FORMACAO.indexOf(nivel) !== -1) obrigatorios.push.apply(obrigatorios, CAMPOS_FORMACAO_CONDICIONAL);
  }

  obrigatorios.forEach(function (campo) {
    const wrapper = document.querySelector('[data-campo="' + campo + '"]');
    if (!wrapper) return;
    const valor = obterValorCampo(wrapper);
    if (!valor) {
      wrapper.classList.add('invalido');
      valido = false;
    } else {
      wrapper.classList.remove('invalido');
    }
  });

  // validações de formato específicas na etapa 1
  if (etapaAtual === 1) {
    const cpfInput = document.querySelector('[data-campo="PROFISSIONAL_CPF"] input');
    const cpf = cpfInput.value.replace(/\D/g, '');
    
    // Nova lógica para verificar se todos os números do CPF são iguais, sem usar '\1'
    const todosIguais = cpf ? cpf.split('').every(function(c) { return c === cpf[0]; }) : false;
    
    if (cpf && (cpf.length !== 11 || todosIguais)) {
      document.querySelector('[data-campo="PROFISSIONAL_CPF"]').classList.add('invalido');
      valido = false;
    }
    const emailInput = document.querySelector('[data-campo="PROFISSIONAL_E_MAIL"] input');
    if (emailInput.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
      document.querySelector('[data-campo="PROFISSIONAL_E_MAIL"]').classList.add('invalido');
      valido = false;
    }
    const telInput = document.querySelector('[data-campo="PROFISSIONAL_TELEFONE"] input');
    const tel = telInput.value.replace(/\D/g, '');
    if (tel && (tel.length < 10 || tel.length > 11)) {
      document.querySelector('[data-campo="PROFISSIONAL_TELEFONE"]').classList.add('invalido');
      valido = false;
    }
  }

  if (!valido) exibirToast('Existem campos obrigatórios pendentes ou inválidos nesta etapa.', 'erro');
  return valido;
}

// ---------------------------------------------------------------------
// LEITURA DE VALORES DE CADA TIPO DE CAMPO
// ---------------------------------------------------------------------
function obterValorCampo(wrapper) {
  if (wrapper.classList.contains('combo')) {
    return wrapper.dataset.valor || '';
  }
  if (wrapper.querySelector('#chips-deficiencia')) {
    const selecionados = Array.prototype.slice.call(wrapper.querySelectorAll('.chip.selecionado'))
      .map(function (c) { return c.dataset.valor; });
    return selecionados.join(',');
  }
  const select = wrapper.querySelector('select');
  if (select) return select.value;
  const input = wrapper.querySelector('input');
  if (input) return input.value;
  return '';
}

function obterRotuloExibicao(wrapper) {
  if (wrapper.classList.contains('combo')) {
    return wrapper.querySelector('input').value || '';
  }
  if (wrapper.querySelector('#chips-deficiencia')) {
    return Array.prototype.slice.call(wrapper.querySelectorAll('.chip.selecionado'))
      .map(function (c) { return c.textContent; }).join(', ');
  }
  const select = wrapper.querySelector('select');
  if (select) return select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
  const input = wrapper.querySelector('input');
  if (input) {
    if (input.type === 'date' && input.value) return formatarDataExibicao(input.value);
    return input.value;
  }
  return '';
}

function formatarDataExibicao(isoDate) {
  const partes = isoDate.split('-');
  if (partes.length !== 3) return isoDate;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function obterRotuloCampo(wrapper) {
  const label = wrapper.querySelector('label');
  if (!label) return wrapper.dataset.campo;
  return label.textContent.replace('*', '').replace(/\(.*?\)/, '').trim();
}

// ---------------------------------------------------------------------
// REVISÃO
// ---------------------------------------------------------------------
function montarRevisao() {
  const container = document.getElementById('revisao-container');
  container.innerHTML = '';

  const grupoEscola = document.createElement('details');
  grupoEscola.className = 'revisao__grupo';
  grupoEscola.innerHTML = '<summary>Escola</summary><dl class="revisao__tabela">' +
    '<div class="revisao__linha"><dt>Unidade escolar</dt><dd>' + (escolaSelecionada ? escaparHtml(escolaSelecionada.nome) : '') + '</dd></div>' +
    '</dl>';
  
  // Modificado: Abre o modal em vez de navegar para trás
  grupoEscola.querySelector('summary').addEventListener('click', function (ev) { 
    ev.preventDefault(); 
    abrirModalEdicao(0); 
  });
  container.appendChild(grupoEscola);

  [1, 2, 3, 4, 5].forEach(function (idEtapa) {
    const secao = document.querySelector('.etapa-conteudo[data-etapa="' + idEtapa + '"]');
    const campos = secao.querySelectorAll('[data-campo]');
    const grupo = document.createElement('details');
    grupo.className = 'revisao__grupo';
    grupo.open = false;
    let linhas = '';
    campos.forEach(function (wrapper) {
      linhas += '<div class="revisao__linha"><dt>' + escaparHtml(obterRotuloCampo(wrapper)) + '</dt><dd>' +
        escaparHtml(obterRotuloExibicao(wrapper)) + '</dd></div>';
    });
    grupo.innerHTML = '<summary>' + ETAPAS[idEtapa].label + '</summary><dl class="revisao__tabela">' + linhas + '</dl>';
    
    // Modificado: Abre o modal em vez de navegar para trás
    grupo.querySelector('summary').addEventListener('click', function (ev) { 
      ev.preventDefault(); 
      abrirModalEdicao(idEtapa); 
    });
    container.appendChild(grupo);
  });
}

// ---------------------------------------------------------------------
// ENVIO DO CADASTRO
// ---------------------------------------------------------------------
function enviarCadastro() {
  const form = {};
  document.querySelectorAll('[data-campo]').forEach(function (wrapper) {
    form[wrapper.dataset.campo] = obterValorCampo(wrapper);
  });
  form.CO_ENTIDADE_VINCULO = escolaSelecionada ? escolaSelecionada.codigo : '';
  form.ESCOLA_NOME = escolaSelecionada ? escolaSelecionada.nome : '';

  const btnEnviar = document.getElementById('btn-enviar');
  btnEnviar.disabled = true;
  btnEnviar.innerHTML = '<span class="spinner"></span> Enviando...';

  google.script.run
    .withSuccessHandler(function (res) { aoReceberRespostaEnvio(res, btnEnviar); })
    .withFailureHandler(function (erro) {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Confirmar e enviar';
      exibirToast('Erro ao enviar: ' + (erro && erro.message ? erro.message : erro), 'erro');
    })
    .salvarProfissional(form);
}

function aoReceberRespostaEnvio(res, btnEnviar) {
  btnEnviar.disabled = false;
  btnEnviar.textContent = 'Confirmar e enviar';

  if (!res || !res.ok) {
    exibirToast((res && res.mensagem) || 'Não foi possível concluir o cadastro.', 'erro');
    if (res && res.erros && res.erros.length) {
      const etapaComErro = localizarEtapaDoCampo(res.erros[0]);
      if (etapaComErro !== null) mostrarEtapa(etapaComErro);
      res.erros.forEach(function (campo) {
        const wrapper = document.querySelector('[data-campo="' + campo + '"]');
        if (wrapper) wrapper.classList.add('invalido');
      });
    }
    return;
  }

  localStorage.removeItem('gpe_rascunho');

  document.getElementById('texto-protocolo').textContent = res.protocolo;
  document.querySelectorAll('.etapa-conteudo').forEach(function (s) { s.classList.add('oculto'); });
  document.querySelector('.etapa-conteudo[data-etapa="sucesso"]').classList.remove('oculto');
  document.getElementById('navegacao').classList.add('oculto');
  exibirToast('Cadastro realizado com sucesso!', 'sucesso');
}

function localizarEtapaDoCampo(campo) {
  for (let i = 1; i <= 5; i++) {
    if (document.querySelector('.etapa-conteudo[data-etapa="' + i + '"] [data-campo="' + campo + '"]')) return i;
  }
  return null;
}

// ---------------------------------------------------------------------
// UTILITÁRIOS
// ---------------------------------------------------------------------
let timeoutToast = null;
function exibirToast(mensagem, tipo) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.className = tipo === 'sucesso' ? 'sucesso' : '';
  toast.classList.add('mostrar');
  if (timeoutToast) clearTimeout(timeoutToast);
  timeoutToast = setTimeout(function () { toast.classList.remove('mostrar'); }, 4500);
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

// =====================================================================
// SISTEMA DE RASCUNHO (CACHE / AUTOSAVE)
// =====================================================================
function salvarRascunho() {
  const form = {};
  const textos = {}; // Guarda os textos visíveis (importante para os combos de município)
  
  document.querySelectorAll('[data-campo]').forEach(function (wrapper) {
    form[wrapper.dataset.campo] = obterValorCampo(wrapper);
    textos[wrapper.dataset.campo] = obterRotuloExibicao(wrapper);
  });
  
  const cacheData = {
    form: form,
    textos: textos,
    escola: escolaSelecionada,
    etapa: etapaAtual
  };
  
  localStorage.setItem('gpe_rascunho', JSON.stringify(cacheData));
}

function carregarRascunho() {
  const salvo = localStorage.getItem('gpe_rascunho');
  if (!salvo) return;
  
  try {
    const cacheData = JSON.parse(salvo);
    
    // 1. Restaura a escola
    if (cacheData.escola) {
      escolaSelecionada = cacheData.escola;
      document.getElementById('selo-escola').textContent = escolaSelecionada.nome;
      document.getElementById('selo-escola').classList.add('ativo');
      // Marca visualmente a escola na lista
      setTimeout(function() {
         const divEscola = document.querySelector('.escola-opcao[data-codigo="' + escolaSelecionada.codigo + '"]');
         if(divEscola) divEscola.classList.add('selecionada');
      }, 300);
    }

    // 2. Restaura os campos preenchidos
    if (cacheData.form) {
      Object.keys(cacheData.form).forEach(function(campo) {
        const wrapper = document.querySelector('[data-campo="' + campo + '"]');
        if (!wrapper) return;
        
        const valor = cacheData.form[campo];
        if (!valor) return;

        if (wrapper.classList.contains('combo')) {
          wrapper.dataset.valor = valor;
          const input = wrapper.querySelector('input');
          if (input && cacheData.textos[campo]) input.value = cacheData.textos[campo];
        } else if (wrapper.querySelector('#chips-deficiencia')) {
          const valores = valor.split(',');
          valores.forEach(function(v) {
            const chip = wrapper.querySelector('.chip[data-valor="' + v + '"]');
            if (chip) chip.classList.add('selecionado');
          });
        } else {
          const input = wrapper.querySelector('input, select');
          if (input) input.value = valor;
        }
      });
    }

    // 3. Pula automaticamente para a etapa onde o usuário parou
    if (cacheData.etapa !== undefined && cacheData.etapa > 0 && cacheData.etapa < 6) {
       mostrarEtapa(cacheData.etapa);
    }
  } catch (e) {
    console.error('Erro ao carregar o rascunho:', e);
  }
}





// =====================================================================
// LÓGICA DO MODAL DE EDIÇÃO
// =====================================================================
let etapaEmEdicaoModal = null;
let etapaConteudoOriginalPai = null;

function abrirModalEdicao(idEtapa) {
  etapaEmEdicaoModal = idEtapa;
  const etapaDiv = document.querySelector('.etapa-conteudo[data-etapa="' + idEtapa + '"]');
  etapaConteudoOriginalPai = etapaDiv.parentNode; // Salva de onde a div saiu
  
  const modalDinamico = document.getElementById('modal-conteudo-dinamico');
  modalDinamico.appendChild(etapaDiv); // Move o formulário para dentro do modal
  
  etapaDiv.classList.remove('oculto');
  document.getElementById('modal-edicao').classList.remove('oculto');
}

function fecharModalEdicao() {
  if (etapaEmEdicaoModal !== null) {
    const etapaDiv = document.querySelector('.etapa-conteudo[data-etapa="' + etapaEmEdicaoModal + '"]');
    if (etapaDiv && etapaConteudoOriginalPai) {
      // Devolve o formulário para o corpo original e oculta
      etapaConteudoOriginalPai.appendChild(etapaDiv);
      etapaDiv.classList.add('oculto');
    }
  }
  document.getElementById('modal-edicao').classList.add('oculto');
  etapaEmEdicaoModal = null;
}

function salvarModalEdicao() {
  // Aproveita a validação existente fingindo que a etapa atual é a do modal
  const etapaAnterior = etapaAtual;
  etapaAtual = etapaEmEdicaoModal;
  const valido = validarEtapaAtual();
  etapaAtual = etapaAnterior; 

  if (valido) {
    fecharModalEdicao();
    montarRevisao(); // Atualiza a tela de revisão com os novos dados
    salvarRascunho(); // Garante que a edição vá para o cache
    exibirToast('Informações atualizadas!', 'sucesso');
  }
}

// Atrela os eventos aos botões Cancelar e Concluir Edição
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModalEdicao);
  document.getElementById('btn-salvar-modal').addEventListener('click', salvarModalEdicao);
});



