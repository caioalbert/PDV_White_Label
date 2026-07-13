/**
 * Chart.js wrapper helpers
 */
import Chart from 'chart.js/auto';

/** Store chart instances by canvas ID for cleanup */
const chartInstances = {};

const defaultColors = [
  '#1B4332', '#2D6A4F', '#40916C', '#52B788', '#95D5B2',
  '#4FC3F7', '#E9C46A', '#E76F51', '#264653', '#2A9D8F',
];

function getOrCreateCanvas(canvasId) {
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas #${canvasId} not found`);
    return null;
  }
  return canvas;
}

export function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
}

export function createBarChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const canvas = getOrCreateCanvas(canvasId);
  if (!canvas) return null;

  const ds = datasets.map((d, i) => ({
    label: d.label || '',
    data: d.data || [],
    backgroundColor: d.color || defaultColors[i % defaultColors.length],
    borderRadius: 6,
    borderSkipped: false,
    maxBarThickness: 50,
    ...d,
  }));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'top', labels: { usePointStyle: true, padding: 20, font: { family: 'Inter', size: 12 } } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } },
        y: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'Inter', size: 11 } }, beginAtZero: true },
      },
      ...options,
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}

export function createLineChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const canvas = getOrCreateCanvas(canvasId);
  if (!canvas) return null;

  const ds = datasets.map((d, i) => ({
    label: d.label || '',
    data: d.data || [],
    borderColor: d.color || defaultColors[i % defaultColors.length],
    backgroundColor: (d.color || defaultColors[i % defaultColors.length]) + '18',
    fill: true,
    tension: 0.4,
    pointRadius: 4,
    pointHoverRadius: 6,
    borderWidth: 2,
    ...d,
  }));

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'top', labels: { usePointStyle: true, padding: 20, font: { family: 'Inter', size: 12 } } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } },
        y: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'Inter', size: 11 } }, beginAtZero: true },
      },
      ...options,
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}

export function createDoughnutChart(canvasId, labels, data, colors) {
  destroyChart(canvasId);
  const canvas = getOrCreateCanvas(canvasId);
  if (!canvas) return null;

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors || defaultColors.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, padding: 16, font: { family: 'Inter', size: 12 } },
        },
      },
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}
