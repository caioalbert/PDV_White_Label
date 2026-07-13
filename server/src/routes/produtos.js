import { Router } from 'express';
import db from '../database.js';
import {
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from '../middleware/auth.js';

const router = Router();
const categoriasValidas = new Set(['gesso_convencional', 'drywall', 'producao_propria']);
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

function validarProduto({ nome, categoria, unidade, preco_venda, estoque_minimo }) {
  if (!String(nome || '').trim()) return 'Nome é obrigatório';
  if (!categoriasValidas.has(categoria)) return 'Categoria inválida';
  if (!unidadesValidas.has(unidade)) return 'Unidade de medida inválida';

  const preco = parseFloat(preco_venda);
  const estoqueMinimo = parseFloat(estoque_minimo);
  if (!Number.isFinite(preco) || preco < 0) return 'Preço de venda inválido';
  if (!Number.isFinite(estoqueMinimo) || estoqueMinimo < 0) return 'Estoque mínimo inválido';
  return null;
}

// GET /api/produtos
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = db('produtos')
      .select('produtos.*')
      .select(
        db.raw(`
          EXISTS (
            SELECT 1
            FROM receitas
            INNER JOIN receita_insumos
              ON receita_insumos.receita_id = receitas.id
            WHERE receitas.produto_id = produtos.id
              AND receitas.ativo = true
          ) AS tem_composicao
        `)
      )
      .orderByRaw('produtos.codigo_interno ASC NULLS LAST')
      .orderBy('produtos.nome');
    const { categoria, search, ativo } = req.query;

    if (categoria) {
      query = query.where('produtos.categoria', categoria);
    }

    if (search) {
      query = query.where(function () {
        this.where('produtos.nome', 'ilike', `%${search}%`)
          .orWhere('produtos.codigo_interno', 'ilike', `%${search}%`)
          .orWhere('produtos.codigo_barras', 'ilike', `%${search}%`);
      });
    }

    if (ativo !== undefined) {
      query = query.where('produtos.ativo', ativo === 'true');
    }

    const produtos = await query;
    res.json(produtos);
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
});

// GET /api/produtos/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const produto = await db('produtos').where({ id: req.params.id }).first();
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    console.error('Erro ao buscar produto:', err);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

// GET /api/produtos/:id/composicao
router.get('/:id/composicao', verifyToken, async (req, res) => {
  try {
    const produto = await db('produtos').where({ id: req.params.id }).first();
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    const receita = await db('receitas')
      .where({ produto_id: req.params.id })
      .orderBy('id')
      .first();

    if (!receita) return res.json([]);

    const insumos = await db('receita_insumos')
      .join('produtos', 'receita_insumos.produto_id', 'produtos.id')
      .select(
        'receita_insumos.produto_id',
        'receita_insumos.quantidade',
        'produtos.nome as produto_nome',
        'produtos.unidade'
      )
      .where('receita_insumos.receita_id', receita.id)
      .orderBy('produtos.nome');

    res.json(insumos);
  } catch (err) {
    console.error('Erro ao buscar composição:', err);
    res.status(500).json({ error: 'Erro ao buscar composição do produto' });
  }
});

// PUT /api/produtos/:id/composicao
router.put('/:id/composicao', verifyToken, requirePermission('produtos'), async (req, res) => {
  try {
    const produtoId = parseInt(req.params.id, 10);
    const { insumos = [] } = req.body;

    if (!Array.isArray(insumos)) {
      return res.status(400).json({ error: 'A composição deve ser uma lista de insumos' });
    }

    const produto = await db('produtos').where({ id: produtoId }).first();
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    if (produto.categoria !== 'producao_propria') {
      return res.status(400).json({
        error: 'A composição só pode ser cadastrada em produtos de produção própria',
      });
    }

    const ids = new Set();
    for (const insumo of insumos) {
      const insumoId = parseInt(insumo.produto_id, 10);
      const quantidade = parseFloat(insumo.quantidade);

      if (!insumoId || !quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Todos os insumos devem ter produto e quantidade válida' });
      }
      if (insumoId === produtoId) {
        return res.status(400).json({ error: 'O produto não pode ser insumo dele mesmo' });
      }
      if (ids.has(insumoId)) {
        return res.status(400).json({ error: 'Não é permitido repetir o mesmo insumo' });
      }
      ids.add(insumoId);
    }

    if (ids.size > 0) {
      const produtosExistentes = await db('produtos').whereIn('id', [...ids]).select('id');
      if (produtosExistentes.length !== ids.size) {
        return res.status(400).json({ error: 'Um ou mais insumos não foram encontrados' });
      }
    }

    await db.transaction(async (trx) => {
      const receitas = await trx('receitas')
        .where({ produto_id: produtoId })
        .orderBy('id');

      if (insumos.length === 0) {
        if (receitas.length > 0) {
          await trx('receitas').whereIn('id', receitas.map((receita) => receita.id)).del();
        }
        return;
      }

      let receita = receitas[0];
      if (!receita) {
        [receita] = await trx('receitas')
          .insert({
            produto_id: produtoId,
            nome: `Composição - ${produto.nome}`,
            ativo: true,
          })
          .returning('*');
      } else {
        await trx('receitas')
          .where({ id: receita.id })
          .update({
            nome: `Composição - ${produto.nome}`,
            ativo: true,
          });
      }

      if (receitas.length > 1) {
        await trx('receitas').whereIn('id', receitas.slice(1).map((item) => item.id)).del();
      }

      await trx('receita_insumos').where({ receita_id: receita.id }).del();
      await trx('receita_insumos').insert(
        insumos.map((insumo) => ({
          receita_id: receita.id,
          produto_id: parseInt(insumo.produto_id, 10),
          quantidade: parseFloat(insumo.quantidade),
        }))
      );
    });

    res.json({ message: 'Composição atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar composição:', err);
    res.status(500).json({ error: 'Erro ao atualizar composição do produto' });
  }
});

// POST /api/produtos
router.post('/', verifyToken, requireAnyPermission('produtos', 'compras'), async (req, res) => {
  try {
    const {
      nome,
      categoria,
      unidade,
      preco_venda,
      estoque_minimo,
      ativo,
      codigo_barras,
    } = req.body;
    const erroValidacao = validarProduto({
      nome,
      categoria,
      unidade,
      preco_venda,
      estoque_minimo,
    });
    if (erroValidacao) return res.status(400).json({ error: erroValidacao });

    const produtoMesmoNome = await db('produtos')
      .whereRaw('LOWER(TRIM(nome)) = LOWER(TRIM(?))', [nome])
      .first();
    if (produtoMesmoNome) {
      return res.status(409).json({
        error: `O produto "${produtoMesmoNome.nome}" já está cadastrado`,
        produto_id: produtoMesmoNome.id,
      });
    }

    const produto = await db.transaction(async (trx) => {
      const [novoProduto] = await trx('produtos')
        .insert({
          nome,
          categoria,
          unidade,
          preco_venda,
          estoque_minimo,
          ativo,
          codigo_interno: null,
          codigo_barras: codigo_barras || null,
        })
        .returning('*');

      const [codigoGerado] = await trx('produtos')
        .where({ id: novoProduto.id })
        .update({ codigo_interno: `PRD${String(novoProduto.id).padStart(6, '0')}` })
        .returning('codigo_interno');
      novoProduto.codigo_interno = codigoGerado.codigo_interno;

      const unidades = await trx('lojas').select('id');
      if (unidades.length > 0) {
        await trx('estoque').insert(unidades.map((unidadeEstoque) => ({
          produto_id: novoProduto.id,
          loja_id: unidadeEstoque.id,
          quantidade: 0,
        })));
      }

      return novoProduto;
    });

    res.status(201).json(produto);
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Código interno ou código de barras já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// PUT /api/produtos/:id
router.put('/:id', verifyToken, requirePermission('produtos'), async (req, res) => {
  try {
    const {
      nome,
      categoria,
      unidade,
      preco_venda,
      estoque_minimo,
      ativo,
      codigo_barras,
    } = req.body;
    const erroValidacao = validarProduto({
      nome,
      categoria,
      unidade,
      preco_venda,
      estoque_minimo,
    });
    if (erroValidacao) return res.status(400).json({ error: erroValidacao });

    const [produto] = await db('produtos')
      .where({ id: req.params.id })
      .update({
        nome,
        categoria,
        unidade,
        preco_venda,
        estoque_minimo,
        ativo,
        codigo_barras: codigo_barras || null,
        updated_at: db.fn.now(),
      })
      .returning('*');

    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Código interno ou código de barras já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// DELETE /api/produtos/:id
router.delete('/:id', verifyToken, requirePermission('produtos'), async (req, res) => {
  try {
    const deleted = await db('produtos').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ message: 'Produto removido com sucesso' });
  } catch (err) {
    console.error('Erro ao remover produto:', err);
    res.status(500).json({ error: 'Erro ao remover produto. Verifique se não há dados vinculados.' });
  }
});

export default router;
