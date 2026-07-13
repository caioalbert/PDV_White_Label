import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, formatDate } from '../../utils.js';
import { getCurrentLojaId } from '../../auth.js';
import Chart from 'chart.js/auto';

let chartVendas = null;
let chartFaturamento = null;

function destroyCharts() {
    if (chartVendas) {
        chartVendas.destroy();
        chartVendas = null;
    }
    if (chartFaturamento) {
        chartFaturamento.destroy();
        chartFaturamento = null;
    }
}

export async function render(container) {
    destroyCharts();

    let data = {};
    try {
        const lojaId = getCurrentLojaId();
        data = await api.get(`/dashboard/resumo${lojaId ? `?loja_id=${lojaId}` : ''}`);
    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
        data = {};
    }

    const vendasHoje = data.vendas_hoje || 0;
    const entradas = data.entradas_hoje || 0;
    const saidas = data.saidas_hoje || 0;
    const baixoEstoque = data.baixo_estoque || data.produtos_baixo_estoque?.length || 0;
    const comprasRecentes = data.compras_recentes || [];
    const produtosBaixoEstoque = data.produtos_baixo_estoque || [];

    if (data.acesso_restrito) {
        container.innerHTML = `
          <div class="dashboard-page">
            <div class="page-header">
                <div>
                    <h1>${icons.layoutDashboard()} Dashboard</h1>
                    <p class="page-subtitle">Indicadores operacionais da sua loja.</p>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card" style="border-left: 4px solid #E9C46A;">
                    <div class="stat-icon" style="background: rgba(233,196,106,0.1); color: #9C6B00;">
                        ${icons.alertTriangle()}
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Produtos com estoque baixo</span>
                        <span class="stat-value">${baixoEstoque}</span>
                    </div>
                </div>
            </div>

            <section class="card">
                <div class="card-header">
                    <h3>${icons.alertTriangle()} Produtos que precisam de reposição</h3>
                </div>
                <div class="card-body">
                    ${produtosBaixoEstoque.length > 0 ? `
                        <ul class="list-simple">
                            ${produtosBaixoEstoque.map((produto) => `
                                <li class="list-item">
                                    <span class="list-item-name">${produto.produto || '-'}</span>
                                    <span class="text-muted">${produto.loja || ''}</span>
                                    <span class="badge badge-danger">
                                        ${produto.quantidade ?? 0} / mínimo ${produto.estoque_minimo ?? 0}
                                    </span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p class="text-muted text-center" style="padding:20px;">Nenhum produto com estoque baixo.</p>'}
                </div>
            </section>
          </div>
        `;
        return;
    }

    container.innerHTML = `
      <div class="dashboard-page">
        <div class="page-header">
            <h1>${icons.layoutDashboard()} Dashboard</h1>
        </div>

        <div class="stats-grid dashboard-stats">
            <div class="stat-card" style="border-left: 4px solid #2D6A4F;">
                <div class="stat-icon" style="background: rgba(45,106,79,0.1); color: #2D6A4F;">
                    ${icons.dollarSign()}
                </div>
                <div class="stat-info">
                    <span class="stat-label">Vendas Hoje</span>
                    <span class="stat-value">${formatCurrency(vendasHoje)}</span>
                </div>
            </div>

            <div class="stat-card" style="border-left: 4px solid #0077B6;">
                <div class="stat-icon" style="background: rgba(0,119,182,0.1); color: #0077B6;">
                    ${icons.trendingUp()}
                </div>
                <div class="stat-info">
                    <span class="stat-label">Entradas</span>
                    <span class="stat-value">${formatCurrency(entradas)}</span>
                </div>
            </div>

            <div class="stat-card" style="border-left: 4px solid #E63946;">
                <div class="stat-icon" style="background: rgba(230,57,70,0.1); color: #E63946;">
                    ${icons.trendingDown()}
                </div>
                <div class="stat-info">
                    <span class="stat-label">Saídas</span>
                    <span class="stat-value">${formatCurrency(saidas)}</span>
                </div>
            </div>

            <div class="stat-card" style="border-left: 4px solid #E9C46A;">
                <div class="stat-icon" style="background: rgba(233,196,106,0.1); color: #E9C46A;">
                    ${icons.alertTriangle()}
                </div>
                <div class="stat-info">
                    <span class="stat-label">Baixo Estoque</span>
                    <span class="stat-value">${baixoEstoque}</span>
                </div>
            </div>
        </div>

        <div class="dashboard-grid dashboard-charts">
            <div class="card dashboard-panel">
                <div class="card-header">
                    <h3>Vendas por Loja</h3>
                </div>
                <div class="card-body dashboard-chart-body">
                    <canvas id="chart-vendas-loja"></canvas>
                </div>
            </div>

            <div class="card dashboard-panel">
                <div class="card-header">
                    <h3>Faturamento Mensal</h3>
                </div>
                <div class="card-body dashboard-chart-body">
                    <canvas id="chart-faturamento"></canvas>
                </div>
            </div>
        </div>

        <div class="dashboard-grid dashboard-details">
            <div class="card dashboard-panel">
                <div class="card-header">
                    <h3>Compras Recentes</h3>
                </div>
                <div class="card-body dashboard-table-wrap">
                    ${comprasRecentes.length > 0 ? `
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Fornecedor</th>
                                    <th>Data</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${comprasRecentes.slice(0, 5).map(c => `
                                    <tr>
                                        <td>${c.fornecedor || '-'}</td>
                                        <td>${c.created_at ? formatDate(c.created_at) : '-'}</td>
                                        <td>${formatCurrency(c.total || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p style="color:#888; text-align:center; padding:20px;">Nenhuma compra recente.</p>'}
                </div>
            </div>

            <div class="card dashboard-panel">
                <div class="card-header">
                    <h3>${icons.alertTriangle()} Produtos com Estoque Baixo</h3>
                </div>
                <div class="card-body">
                    ${produtosBaixoEstoque.length > 0 ? `
                        <ul class="list-simple">
                            ${produtosBaixoEstoque.map(p => `
                                <li class="list-item">
                                    <span class="list-item-name">${p.produto || p.nome || '-'}</span>
                                    <span class="text-muted">${p.loja || ''}</span>
                                    <span class="badge badge-danger">${p.quantidade ?? p.estoque ?? 0}</span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p style="color:#888; text-align:center; padding:20px;">Nenhum produto com estoque baixo.</p>'}
                </div>
            </div>
        </div>
      </div>
    `;

    // Chart: Vendas por Loja (Bar)
    const vendasPorLoja = data.vendas_por_loja || [
        { loja: 'Loja 1', total: 0 },
        { loja: 'Loja 2', total: 0 }
    ];

    const ctxVendas = container.querySelector('#chart-vendas-loja');
    if (ctxVendas) {
        chartVendas = new Chart(ctxVendas, {
            type: 'bar',
            data: {
                labels: vendasPorLoja.map(v => v.loja || v.nome || ''),
                datasets: [{
                    label: 'Vendas',
                    data: vendasPorLoja.map(v => v.total || v.valor || 0),
                    backgroundColor: ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#95D5B2'],
                    borderRadius: 8,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            maxTicksLimit: 6,
                            callback: (val) => formatCurrency(val)
                        }
                    },
                    x: {
                        ticks: {
                            autoSkip: true,
                            maxRotation: 0
                        }
                    }
                }
            }
        });
    }

    // Chart: Faturamento Mensal (Line)
    const faturamentoMensal = data.faturamento_mensal || [
        { mes: 'Jan', total: 0 },
        { mes: 'Fev', total: 0 },
        { mes: 'Mar', total: 0 },
        { mes: 'Abr', total: 0 },
        { mes: 'Mai', total: 0 },
        { mes: 'Jun', total: 0 }
    ];

    const ctxFaturamento = container.querySelector('#chart-faturamento');
    if (ctxFaturamento) {
        chartFaturamento = new Chart(ctxFaturamento, {
            type: 'line',
            data: {
                labels: faturamentoMensal.map(f => f.mes || ''),
                datasets: [{
                    label: 'Faturamento',
                    data: faturamentoMensal.map(f => f.total || f.valor || 0),
                    borderColor: '#2D6A4F',
                    backgroundColor: 'rgba(45, 106, 79, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#1B4332',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            maxTicksLimit: 6,
                            callback: (val) => formatCurrency(val)
                        }
                    },
                    x: {
                        ticks: {
                            autoSkip: true,
                            maxRotation: 0
                        }
                    }
                }
            }
        });
    }
}
