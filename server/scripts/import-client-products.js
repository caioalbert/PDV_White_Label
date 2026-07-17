import db from '../src/database.js';

const unidadesValidas = new Set([
  'unidade',
  'saco',
  'kg',
  'caixa',
  'metro',
  'pacote',
  'balde',
  'barra',
  'rolo',
  'chapa',
]);

const produtosCliente = [
  { codigoCliente: '0001', nome: 'Gesso em pó - 0001', categoria: 'gesso_convencional', unidade: 'saco' },
  { codigoCliente: '0002', nome: 'Gesso em pó - 0002', categoria: 'gesso_convencional', unidade: 'saco' },
  { codigoCliente: '0003', nome: 'Plaquinha de gesso', categoria: 'gesso_convencional', unidade: 'unidade' },
  { codigoCliente: '0004', nome: 'Bloco divisória', categoria: 'gesso_convencional', unidade: 'unidade' },
  { codigoCliente: '0005', nome: 'Gessocola 5 kg', categoria: 'gesso_convencional', unidade: 'pacote' },
  { codigoCliente: '0006', nome: 'Sisal (bucha)', categoria: 'gesso_convencional', unidade: 'unidade' },
  { codigoCliente: '0101', nome: 'Plaquinha de drywall', categoria: 'drywall', unidade: 'unidade' },
  { codigoCliente: '0102', nome: 'Placa de drywall', categoria: 'drywall', unidade: 'chapa' },
  { codigoCliente: '0103', nome: 'Fita telada', categoria: 'drywall', unidade: 'rolo' },
  { codigoCliente: '0104', nome: 'Prego de aço', categoria: 'drywall', unidade: 'pacote' },
  { codigoCliente: '0105', nome: 'Junção H', categoria: 'drywall', unidade: 'unidade' },
  { codigoCliente: '0106', nome: 'Massa para drywall', categoria: 'drywall', unidade: 'balde' },
  { codigoCliente: '0107', nome: 'Parafuso G', categoria: 'drywall', unidade: 'caixa' },
  { codigoCliente: '0108', nome: 'Tabica branca', categoria: 'drywall', unidade: 'barra' },
  { codigoCliente: '0109', nome: 'Cantoneira', categoria: 'drywall', unidade: 'barra' },
  { codigoCliente: '0110', nome: 'Montante 48 mm', categoria: 'drywall', unidade: 'barra' },
  { codigoCliente: '0111', nome: 'Guia 48 mm', categoria: 'drywall', unidade: 'barra' },
  { codigoCliente: '0112', nome: 'Perfil F530', categoria: 'drywall', unidade: 'barra' },
  { codigoCliente: '0113', nome: 'Regulador', categoria: 'drywall', unidade: 'unidade' },
  { codigoCliente: '0114', nome: 'Arame galvanizado', categoria: 'drywall', unidade: 'kg' },
  { codigoCliente: '0115', nome: 'Arame nº 18', categoria: 'drywall', unidade: 'kg' },
  { codigoCliente: '0201', nome: 'Prancha 35', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0202', nome: 'Prancha 40', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0203', nome: 'Prancha 45', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0204', nome: 'Prancha 50', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0205', nome: 'Molde Peito', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0206', nome: 'Molde Tradicional', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0207', nome: 'Molde Escadinha', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0208', nome: 'Molde Meia', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0209', nome: 'Ripado 33,3', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0210', nome: 'Placa 3D', categoria: 'producao_propria', unidade: 'unidade' },
  { codigoCliente: '0211', nome: 'Dilatação p', categoria: 'producao_propria', unidade: 'unidade' },
];

function gerarCodigoInterno(id) {
  return `PRD${String(id).padStart(6, '0')}`;
}

function validarCatalogo(categoriasPorSlug) {
  const codigos = new Set();

  for (const produto of produtosCliente) {
    if (!/^\d{4}$/.test(produto.codigoCliente)) {
      throw new Error(`Código do cliente inválido: ${produto.codigoCliente}`);
    }
    if (codigos.has(produto.codigoCliente)) {
      throw new Error(`Código do cliente duplicado no import: ${produto.codigoCliente}`);
    }
    if (!produto.nome.trim()) {
      throw new Error(`Nome obrigatório para o código do cliente ${produto.codigoCliente}`);
    }
    if (!categoriasPorSlug.has(produto.categoria)) {
      throw new Error(`Categoria inválida para ${produto.codigoCliente}: ${produto.categoria}`);
    }
    if (!unidadesValidas.has(produto.unidade)) {
      throw new Error(`Unidade inválida para ${produto.codigoCliente}: ${produto.unidade}`);
    }
    codigos.add(produto.codigoCliente);
  }
}

async function importarProdutos() {
  const lojas = await db('lojas').select('id').orderBy('id');
  if (lojas.length === 0) {
    throw new Error('Cadastre ao menos uma loja antes de importar produtos');
  }

  return db.transaction(async (trx) => {
    const resultado = [];
    const categorias = await trx('produto_categorias')
      .where({ ativo: true })
      .select('id', 'slug');
    const categoriasPorSlug = new Map(categorias.map((categoria) => [categoria.slug, categoria]));

    validarCatalogo(categoriasPorSlug);

    for (const produto of produtosCliente) {
      const categoria = categoriasPorSlug.get(produto.categoria);
      const dadosProduto = {
        nome: produto.nome,
        categoria: categoria.slug,
        categoria_id: categoria.id,
        unidade: produto.unidade,
        preco_venda: 0,
        estoque_minimo: 0,
        ativo: true,
      };

      const existente = await trx('produtos')
        .where({ codigo_interno: produto.codigoCliente })
        .orWhereRaw('LOWER(TRIM(nome)) = LOWER(TRIM(?))', [produto.nome])
        .first();

      let produtoPersistido;
      let acao;

      if (existente) {
        const codigoInterno = gerarCodigoInterno(existente.id);

        [produtoPersistido] = await trx('produtos')
          .where({ id: existente.id })
          .update({
            ...dadosProduto,
            codigo_interno: codigoInterno,
            updated_at: trx.fn.now(),
          })
          .returning(['id', 'codigo_interno', 'nome', 'categoria', 'unidade']);
        acao = 'atualizado';
      } else {
        [produtoPersistido] = await trx('produtos')
          .insert({
            ...dadosProduto,
            codigo_interno: null,
            codigo_barras: null,
          })
          .returning(['id', 'codigo_interno', 'nome', 'categoria', 'unidade']);

        [produtoPersistido] = await trx('produtos')
          .where({ id: produtoPersistido.id })
          .update({ codigo_interno: gerarCodigoInterno(produtoPersistido.id) })
          .returning(['id', 'codigo_interno', 'nome', 'categoria', 'unidade']);
        acao = 'inserido';
      }

      await trx('estoque')
        .insert(lojas.map((loja) => ({
          produto_id: produtoPersistido.id,
          loja_id: loja.id,
          quantidade: 0,
        })))
        .onConflict(['produto_id', 'loja_id'])
        .ignore();

      resultado.push({
        acao,
        codigo: produtoPersistido.codigo_interno,
        nome: produtoPersistido.nome,
        categoria: produtoPersistido.categoria,
        unidade: produtoPersistido.unidade,
      });
    }

    return resultado;
  });
}

try {
  const resultado = await importarProdutos();
  const inseridos = resultado.filter((item) => item.acao === 'inserido').length;
  const atualizados = resultado.filter((item) => item.acao === 'atualizado').length;

  console.table(resultado);
  console.log(`Import concluído: ${inseridos} inserido(s), ${atualizados} atualizado(s).`);
} finally {
  await db.destroy();
}
