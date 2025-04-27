// Global değişkenler
let componentParams = [];
let componentCharts = [];
let sensorSignalChart = null;
let heatmapChart = null;
let costBreakdownChart = null;
let cumulativeCostChart = null;
let chartsInitialized = false;

// DOM yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    // Event listeners
    document.getElementById('componentCount').addEventListener('change', updateComponentTable);
    document.getElementById('failureThreshold').addEventListener('change', updateComponentTable);
    document.getElementById('degradationProb').addEventListener('change', updateComponentTable);
    document.getElementById('runSimulation').addEventListener('click', runSimulation);
    document.getElementById('saveComponentParams').addEventListener('click', saveComponentParameters);
    
    // İlk komponent tablosunu oluştur
    updateComponentTable();
    
    // Chart.js için varsayılan renk paletini ayarla
    Chart.defaults.color = '#6c757d';
    Chart.defaults.font.family = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
});

// Komponent tablosunu güncelleme
function updateComponentTable() {
    const componentCount = parseInt(document.getElementById('componentCount').value);
    const defaultK = parseInt(document.getElementById('failureThreshold').value);
    const defaultP = parseFloat(document.getElementById('degradationProb').value);
    
    // Mevcut parametre değerlerini koru
    const oldParams = [...componentParams];
    componentParams = [];
    
    for (let i = 0; i < componentCount; i++) {
        if (i < oldParams.length) {
            // Mevcut parametreleri koru
            componentParams.push(oldParams[i]);
        } else {
            // Yeni varsayılan parametrelerle oluştur
            componentParams.push({
                name: `Komponent ${i + 1}`,
                k: defaultK,
                p: defaultP,
                cost: 100.0
            });
        }
    }
    
    // Tabloyu güncelle
    renderComponentTable();
}

// Komponent tablosunu render etme
function renderComponentTable() {
    const tableBody = document.getElementById('componentTableBody');
    tableBody.innerHTML = '';
    
    componentParams.forEach((comp, index) => {
        const row = document.createElement('tr');
        
        // Komponent adı
        const nameCell = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-control';
        nameInput.value = comp.name;
        nameInput.dataset.index = index;
        nameInput.dataset.param = 'name';
        nameInput.addEventListener('change', updateComponentParam);
        nameCell.appendChild(nameInput);
        
        // Arıza eşiği (K)
        const kCell = document.createElement('td');
        const kInput = document.createElement('input');
        kInput.type = 'number';
        kInput.className = 'form-control';
        kInput.min = 1;
        kInput.max = 20;
        kInput.value = comp.k;
        kInput.dataset.index = index;
        kInput.dataset.param = 'k';
        kInput.addEventListener('change', updateComponentParam);
        kCell.appendChild(kInput);
        
        // Bozulma olasılığı (P)
        const pCell = document.createElement('td');
        const pInput = document.createElement('input');
        pInput.type = 'number';
        pInput.className = 'form-control';
        pInput.min = 0.01;
        pInput.max = 1;
        pInput.step = 0.01;
        pInput.value = comp.p;
        pInput.dataset.index = index;
        pInput.dataset.param = 'p';
        pInput.addEventListener('change', updateComponentParam);
        pCell.appendChild(pInput);
        
        // Komponent maliyeti
        const costCell = document.createElement('td');
        const costInput = document.createElement('input');
        costInput.type = 'number';
        costInput.className = 'form-control';
        costInput.min = 1;
        costInput.max = 10000;
        costInput.step = 10;
        costInput.value = comp.cost;
        costInput.dataset.index = index;
        costInput.dataset.param = 'cost';
        costInput.addEventListener('change', updateComponentParam);
        costCell.appendChild(costInput);
        
        // Tüm hücreleri satıra ekle
        row.appendChild(nameCell);
        row.appendChild(kCell);
        row.appendChild(pCell);
        row.appendChild(costCell);
        
        // Satırı tabloya ekle
        tableBody.appendChild(row);
    });
}

// Komponent parametrelerini güncelle
function updateComponentParam(event) {
    const index = parseInt(event.target.dataset.index);
    const param = event.target.dataset.param;
    let value = event.target.value;
    
    // Sayısal değerler için dönüşüm
    if (param === 'k' || param === 'cost') {
        value = parseInt(value);
    } else if (param === 'p') {
        value = parseFloat(value);
    }
    
    // Parametreyi güncelle
    componentParams[index][param] = value;
}

// Komponent parametrelerini kaydet
function saveComponentParameters() {
    try {
        // Modal'ı kapat
        const modal = bootstrap.Modal.getInstance(document.getElementById('componentModal'));
        modal.hide();
        
        // API'ye parametreleri gönderebilirsiniz (isteğe bağlı)
        fetch('/api/component_params', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ component_params: componentParams }),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Komponent parametreleri güncellendi');
        })
        .catch(error => {
            console.error('Hata:', error);
        });
    } catch (error) {
        // Modal kapanmazsa sessizce devam et
    }
}

// Grafikleri temizle
function destroyCharts() {
    try {
        if (componentCharts.length > 0) {
            componentCharts.forEach(chart => {
                if (chart) chart.destroy();
            });
            componentCharts = [];
        }
        
        if (sensorSignalChart) sensorSignalChart.destroy();
        if (heatmapChart) heatmapChart.destroy();
        if (costBreakdownChart) costBreakdownChart.destroy();
        if (cumulativeCostChart) cumulativeCostChart.destroy();
        
        sensorSignalChart = null;
        heatmapChart = null;
        costBreakdownChart = null;
        cumulativeCostChart = null;
        
        chartsInitialized = false;
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}

// Grafikleri başlat
function initCharts() {
    try {
        if (chartsInitialized) {
            return; // Zaten başlatılmış, tekrar başlatma
        }
        
        // Temizlik - grafikleri yeniden oluşturmadan önce eski grafikleri temizle
        destroyCharts();
        
        const componentContainer = document.getElementById('componentStatesContainer');
        componentContainer.innerHTML = '';
        
        // Komponent sayısı ve simülasyon adımlarını al
        const compCount = componentParams.length;
        const steps = parseInt(document.getElementById('simulationSteps').value);
        
        // Her komponent için canvas oluştur
        for (let i = 0; i < compCount; i++) {
            const canvas = document.createElement('canvas');
            canvas.id = `componentChart_${i}`;
            canvas.height = 120;
            componentContainer.appendChild(canvas);
            
            // Boş grafik oluştur
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Array.from({length: steps}, (_, i) => i + 1),
                    datasets: [{
                        label: componentParams[i].name,
                        data: Array(steps).fill(0),
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true
                    }, {
                        label: 'Arıza Eşiği',
                        data: Array(steps).fill(componentParams[i].k),
                        borderColor: 'rgb(255, 99, 132)',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: `${componentParams[i].name} (K=${componentParams[i].k}, P=${componentParams[i].p})`,
                            position: 'top'
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            suggestedMax: componentParams[i].k * 1.5,
                            title: {
                                display: true,
                                text: 'Degradasyon Seviyesi'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Zaman'
                            },
                            ticks: {
                                maxTicksLimit: 10
                            }
                        }
                    }
                }
            });
            
            componentCharts.push(chart);
        }
        
        // Sensör sinyali grafiği
        const sensorCanvas = document.getElementById('sensorSignalChart');
        if (sensorCanvas) {
            const sensorCtx = sensorCanvas.getContext('2d');
            if (sensorCtx) {
                sensorSignalChart = new Chart(sensorCtx, {
                    type: 'line',
                    data: {
                        labels: Array.from({length: steps}, (_, i) => i + 1),
                        datasets: [{
                            label: 'Sistem Durumu',
                            data: Array(steps).fill(0),
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            borderWidth: 2,
                            pointRadius: 3,
                            pointBackgroundColor: function(context) {
                                const value = context.dataset.data[context.dataIndex];
                                return value === 0 ? 'green' : 
                                      value === 1 ? 'gold' : 
                                      'red';
                            },
                            pointBorderColor: function(context) {
                                const value = context.dataset.data[context.dataIndex];
                                return value === 0 ? 'darkgreen' : 
                                      value === 1 ? 'darkorange' : 
                                      'darkred';
                            },
                            stepped: true
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Sensör Sinyal Durumu',
                                font: {
                                    size: 16
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const value = context.dataset.data[context.dataIndex];
                                        return value === 0 ? 'Yeşil (Sağlıklı)' : 
                                              value === 1 ? 'Sarı (Bozulma Başladı)' : 
                                              'Kırmızı (Arıza)';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 2,
                                ticks: {
                                    stepSize: 1,
                                    callback: function(value) {
                                        return value === 0 ? 'Yeşil (0)' : 
                                              value === 1 ? 'Sarı (1)' : 
                                              value === 2 ? 'Kırmızı (2)' : '';
                                    }
                                }
                            },
                            x: {
                                ticks: {
                                    maxTicksLimit: 10
                                }
                            }
                        }
                    }
                });
            }
        }
        
        // Maliyet dağılımı grafiği
        const breakdownCanvas = document.getElementById('costBreakdownChart');
        if (breakdownCanvas) {
            const breakdownCtx = breakdownCanvas.getContext('2d');
            if (breakdownCtx) {
                costBreakdownChart = new Chart(breakdownCtx, {
                    type: 'bar',
                    data: {
                        labels: ['Bakım', 'Arıza', 'Denetim', 'Toplam'],
                        datasets: [{
                            label: 'Maliyet Dağılımı',
                            data: [0, 0, 0, 0],
                            backgroundColor: [
                                'rgba(54, 162, 235, 0.7)',
                                'rgba(255, 99, 132, 0.7)',
                                'rgba(255, 206, 86, 0.7)',
                                'rgba(75, 192, 192, 0.7)'
                            ],
                            borderColor: [
                                'rgba(54, 162, 235, 1)',
                                'rgba(255, 99, 132, 1)',
                                'rgba(255, 206, 86, 1)',
                                'rgba(75, 192, 192, 1)'
                            ],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Maliyet Dağılımı',
                                font: {
                                    size: 16
                                }
                            },
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Maliyet'
                                }
                            }
                        }
                    }
                });
            }
        }
        
        // Kümülatif maliyet grafiği
        const cumulativeCanvas = document.getElementById('cumulativeCostChart');
        if (cumulativeCanvas) {
            const cumulativeCtx = cumulativeCanvas.getContext('2d');
            if (cumulativeCtx) {
                cumulativeCostChart = new Chart(cumulativeCtx, {
                    type: 'line',
                    data: {
                        labels: Array.from({length: steps}, (_, i) => i + 1),
                        datasets: [{
                            label: 'Kümülatif Maliyet',
                            data: Array(steps).fill(0),
                            borderColor: 'rgb(153, 102, 255)',
                            backgroundColor: 'rgba(153, 102, 255, 0.1)',
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Kümülatif Maliyet',
                                font: {
                                    size: 16
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Maliyet'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Zaman'
                                },
                                ticks: {
                                    maxTicksLimit: 10
                                }
                            }
                        }
                    }
                });
            }
        }
        
        // Isı haritası grafiği - boş olarak oluştur, veriler sonra güncellenecek
        createHeatmapChart(compCount, steps);
        
        chartsInitialized = true;
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}

// Boş ısı haritası oluştur
function createHeatmapChart(compCount, steps) {
    try {
        const heatmapCanvas = document.getElementById('heatmapChart');
        if (!heatmapCanvas) return;
        
        const heatmapCtx = heatmapCanvas.getContext('2d');
        if (!heatmapCtx) return;
        
        // Eski grafiği temizle
        if (heatmapChart) {
            heatmapChart.destroy();
        }
        
        // Boş veri hazırla
        const data = [];
        
        // Isı haritası grafiği için boş veri oluştur (scatter kullanarak)
        heatmapChart = new Chart(heatmapCtx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Komponent Bozulma Durumu',
                    data: data,
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    pointRadius: 25,
                    pointHoverRadius: 25
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Komponent Degradasyon Isı Haritası',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (!context.raw) return '';
                                return `Bozulma: ${Math.round(context.raw.value)}%`;
                            }
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Zaman Adımı'
                        },
                        min: -0.5,
                        max: 9.5,
                        ticks: {
                            stepSize: 1
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Komponent'
                        },
                        min: -0.5,
                        max: compCount - 0.5,
                        ticks: {
                            callback: function(value) {
                                if (value >= 0 && value < componentParams.length) {
                                    return componentParams[value].name;
                                }
                                return '';
                            },
                            stepSize: 1
                        }
                    }
                }
            }
        });
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}

// Simülasyonu çalıştır
function runSimulation() {
    try {
        // Ekranı güncelle
        document.getElementById('resultSummary').textContent = 'Simülasyon çalışıyor...';
        
        // Grafikleri başlat (ilk kez)
        if (!chartsInitialized) {
            initCharts();
        }
        
        // Simülasyon parametrelerini topla
        const config = {
            C: parseInt(document.getElementById('componentCount').value),
            K: parseInt(document.getElementById('failureThreshold').value),
            P: parseFloat(document.getElementById('degradationProb').value),
            simulation_steps: parseInt(document.getElementById('simulationSteps').value),
            maintenance_cost: parseFloat(document.getElementById('maintenanceCost').value),
            failure_cost: parseFloat(document.getElementById('failureCost').value),
            inspection_cost: parseFloat(document.getElementById('inspectionCost').value),
            component_params: componentParams
        };
        
        // API'ye simülasyon talebi gönder
        fetch('/api/run_simulation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        })
        .then(response => response.json())
        .then(data => {
            // Grafikleri güncelle
            updateSimulationResults(data);
        })
        .catch(error => {
            console.error('Hata:', error);
            document.getElementById('resultSummary').textContent = 'Simülasyon sırasında hata oluştu!';
        });
    } catch (error) {
        document.getElementById('resultSummary').textContent = 'Simülasyon sırasında hata oluştu!';
    }
}

// Simülasyon sonuçlarını güncelle
function updateSimulationResults(results) {
    try {
        // Sonuç özetini güncelle
        document.getElementById('resultSummary').innerHTML = `
            <strong>Simülasyon Tamamlandı:</strong> Toplam müdahale sayısı: ${results.intervention_count}, 
            Arıza sayısı: ${results.failure_count}
        `;
        
        // Performans metriklerini güncelle
        document.getElementById('totalCost').textContent = `${results.costs.total_cost.toFixed(2)} ₺`;
        document.getElementById('uptimePercentage').textContent = `${results.performance_metrics.uptime_percentage.toFixed(2)}%`;
        document.getElementById('mtbf').textContent = `${results.performance_metrics.mtbf.toFixed(2)} adım`;
        
        // Grafikleri güncelle
        updateComponentStateCharts(results);
        updateSensorSignalChart(results);
        updateCostCharts(results);
        updateHeatmapChart(results);
    } catch (error) {
        document.getElementById('resultSummary').textContent = 'Sonuçlar güncellenirken hata oluştu!';
    }
}

// Komponent durum grafiklerini güncelle
function updateComponentStateCharts(results) {
    try {
        const componentCount = Math.min(componentParams.length, componentCharts.length);
        
        for (let i = 0; i < componentCount; i++) {
            // Komponent durumlarını al
            const componentStates = results.component_states[i];
            
            // Grafiği güncelle
            componentCharts[i].data.datasets[0].data = componentStates;
            componentCharts[i].update();
        }
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}

// Sensör sinyal grafiğini güncelle
function updateSensorSignalChart(results) {
    try {
        if (sensorSignalChart) {
            sensorSignalChart.data.datasets[0].data = results.sensor_signals;
            sensorSignalChart.update();
        }
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}

// Maliyet grafiklerini güncelle
function updateCostCharts(results) {
    try {
        // Maliyet dağılımı grafiğini güncelle
        if (costBreakdownChart) {
            costBreakdownChart.data.datasets[0].data = [
                results.costs.maintenance_cost,
                results.costs.failure_cost,
                results.costs.inspection_cost,
                results.costs.total_cost
            ];
            costBreakdownChart.update();
        }
        
        // Kümülatif maliyet grafiğini güncelle
        if (cumulativeCostChart) {
            cumulativeCostChart.data.datasets[0].data = results.cost_data.cumulative_costs;
            
            // Bakım olaylarını göster
            if (results.maintenance_events && results.maintenance_events.length > 0) {
                // Bakım olayları için dikey çizgiler ekle
                const maintenanceEvents = {
                    type: 'line',
                    label: 'Bakım Olayları',
                    data: Array(results.cost_data.cumulative_costs.length).fill(null),
                    borderColor: 'rgba(255, 99, 132, 0.7)',
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointRadius: 0
                };
                
                // Bakım olaylarını işaret et
                for (const event of results.maintenance_events) {
                    if (event >= 0 && event < results.cost_data.cumulative_costs.length) {
                        maintenanceEvents.data[event] = results.cost_data.cumulative_costs[event];
                    }
                }
                
                // Eğer zaten bakım olayları dataseti varsa güncelle, yoksa ekle
                if (cumulativeCostChart.data.datasets.length > 1) {
                    cumulativeCostChart.data.datasets[1] = maintenanceEvents;
                } else {
                    cumulativeCostChart.data.datasets.push(maintenanceEvents);
                }
            }
            
            cumulativeCostChart.update();
        }
        
        // Maliyet dağılımı metin açıklamasını güncelle
        const costBreakdownText = document.getElementById('costBreakdownText');
        if (costBreakdownText) {
            costBreakdownText.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">Maliyet Dağılımı Detayları</h5>
                        <table class="table table-striped table-sm">
                            <tr>
                                <td>Bakım Maliyeti:</td>
                                <td><strong>${results.costs.maintenance_cost.toFixed(2)} ₺</strong></td>
                            </tr>
                            <tr>
                                <td>&nbsp;&nbsp;- Komponent Değişimi:</td>
                                <td>${results.costs.component_replacement_cost.toFixed(2)} ₺</td>
                            </tr>
                            <tr>
                                <td>&nbsp;&nbsp;- Bakım İşçiliği:</td>
                                <td>${results.costs.maintenance_labor_cost.toFixed(2)} ₺</td>
                            </tr>
                            <tr>
                                <td>Arıza Maliyeti:</td>
                                <td><strong>${results.costs.failure_cost.toFixed(2)} ₺</strong></td>
                            </tr>
                            <tr>
                                <td>Denetim Maliyeti:</td>
                                <td><strong>${results.costs.inspection_cost.toFixed(2)} ₺</strong></td>
                            </tr>
                            <tr class="table-primary">
                                <td><strong>Toplam Maliyet:</strong></td>
                                <td><strong>${results.costs.total_cost.toFixed(2)} ₺</strong></td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}

// Isı haritası grafiğini güncelle - gerçek ısı haritası gibi
function updateHeatmapChart(results) {
    try {
        // Eski grafiği temizle
        if (heatmapChart) {
            heatmapChart.destroy();
        }
        
        const heatmapCtx = document.getElementById('heatmapChart').getContext('2d');
        
        // Komponent durumlarından ısı haritası verilerini hazırla
        const componentCount = results.component_states.length;
        const timeSteps = results.component_states[0].length;
        
        // Zaman adımlarından örnekleme yapalım (100 adım çok fazla olabilir, 10 adıma indirelim)
        const sampledTimePoints = 10;
        const timeLabels = [];
        
        for (let j = 0; j < sampledTimePoints; j++) {
            const timeIndex = Math.floor(j * timeSteps / sampledTimePoints);
            timeLabels.push(timeIndex);
        }
        
        // Her komponent için normalize edilmiş veriler hazırla
        const datasets = [];
        
        for (let i = 0; i < componentCount; i++) {
            const data = [];
            const threshold = componentParams[i].k;
            
            for (let j = 0; j < sampledTimePoints; j++) {
                const timeIndex = Math.floor(j * timeSteps / sampledTimePoints);
                
                // Normalize edilmiş bozulma seviyesi (0-100 aralığında)
                const value = results.component_states[i][timeIndex];
                const normalizedValue = Math.min(100, (value / threshold) * 100);
                
                // Hücre değeri ve metni
                data.push({
                    x: j,
                    y: componentCount - 1 - i,  // Y ekseni tersine çevrilmiş olmalı
                    value: normalizedValue,
                    originalValue: value
                });
            }
            
            datasets.push({
                label: componentParams[i].name,
                data: data
            });
        }
        
        // Verileri düzleştir
        const allData = [];
        datasets.forEach(dataset => {
            dataset.data.forEach(item => {
                allData.push(item);
            });
        });
        
        // Renk skalası fonksiyonu
        const getColor = function(value) {
            // Yeşil (0) -> Sarı (50) -> Kırmızı (100) geçişi
            if (value < 33) {
                return `rgba(0, 128, 0, ${0.4 + value / 100})`;  // Yeşil
            } else if (value < 66) {
                return `rgba(255, 255, 0, ${0.4 + (value - 33) / 100})`;  // Sarı
            } else {
                return `rgba(255, 0, 0, ${0.4 + (value - 66) / 100})`;  // Kırmızı
            }
        };
        
        // Isı haritası grafiği için değer metni görüntüleme
        const renderText = function(chart) {
            const ctx = chart.ctx;
            
            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                
                dataset.data.forEach((data, index) => {
                    const element = meta.data[index];
                    
                    // Eğer element tanımlıysa ve görünürse
                    if (element && !element.hidden) {
                        const position = element.tooltipPosition();
                        
                        // Metin rengi
                        ctx.fillStyle = data.value < 50 ? 'black' : 'white';
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        // Sadece tam sayı değerini göster
                        const displayValue = Math.round(data.originalValue);
                        ctx.fillText(displayValue, position.x, position.y);
                    }
                });
            });
        };
        
        // Isı haritası grafiğini oluştur (scatter kullanarak)
        heatmapChart = new Chart(heatmapCtx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Komponent Bozulma Durumu',
                    data: allData,
                    backgroundColor: function(context) {
                        if (!context.raw) return 'rgba(0, 0, 0, 0)';
                        return getColor(context.raw.value);
                    },
                    pointRadius: 25,
                    pointHoverRadius: 25
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Komponent Degradasyon Isı Haritası Zaman İçinde',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const data = context.raw;
                                const componentIndex = componentCount - 1 - data.y;
                                return `${componentParams[componentIndex].name}: ${Math.round(data.value)}% bozulma (değer: ${data.originalValue.toFixed(1)})`;
                            }
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Zaman Adımı'
                        },
                        ticks: {
                            callback: function(value, index) {
                                if (timeLabels[value] !== undefined) {
                                    return timeLabels[value];
                                }
                                return '';
                            },
                            stepSize: 1
                        },
                        min: -0.5,
                        max: sampledTimePoints - 0.5
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Komponent'
                        },
                        ticks: {
                            callback: function(value) {
                                const componentIndex = componentCount - 1 - value;
                                if (componentIndex >= 0 && componentIndex < componentParams.length) {
                                    return componentParams[componentIndex].name;
                                }
                                return '';
                            },
                            stepSize: 1
                        },
                        min: -0.5,
                        max: componentCount - 0.5
                    }
                },
                animation: {
                    onComplete: function(animation) {
                        renderText(this);
                    }
                }
            }
        });
        
        // Açıklama metni güncelle
        const heatmapDescription = document.querySelector('.chart-description');
        if (heatmapDescription) {
            heatmapDescription.innerHTML = `
                Bu ısı haritası, her komponentin zaman içindeki bozulma durumunu gösterir.
                <br>Renk skalası: Yeşil (sağlıklı) → Sarı (orta derece bozulma) → Kırmızı (kritik bozulma)
            `;
        }
    } catch (error) {
        // Hata olursa sessizce devam et
    }
}