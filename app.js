// State variables
let data = [];
let selectedYear = 2025;
let selectedMarket = 'All Markets';
let currentView = 'Daily';
let weeklyData = {};
let monthlyData = {};
let yearlyData = {};
let dailyData = {};
let markets = ['All Markets'];
let years = [2025];
let selectedMonth = 10;


// Utility functions
function getWeekNumber(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

function processData(rawData) {
    // Debug: Log first row to see available fields
    if (rawData.length > 0) {
        console.log('=== CSV DEBUG INFO ===');
        console.log('CSV Columns:', Object.keys(rawData[0]));
        console.log('First row sample:', rawData[0]);

        // Show time-related fields
        const timeFields = Object.keys(rawData[0]).filter(key =>
            key.toLowerCase().includes('time') ||
            key.toLowerCase().includes('date') ||
            key.toLowerCase().includes('open') ||
            key.toLowerCase().includes('close')
        );
        console.log('Time/Date related fields:', timeFields);
        console.log('====================');
    }

    const cleanData = rawData.map(row => {
        let plAmount = 0;
        if (row['PL Amount']) {
            const plStr = String(row['PL Amount']).replace(/[£$€,]/g, '');
            plAmount = parseFloat(plStr) || 0;
        }

        // Calculate points (price difference between close and open)
        let plPoints = 0;
        let openPrice = 0;
        let closePrice = 0;

        // Search through all keys to find open/close prices (case-insensitive)
        const keys = Object.keys(row);

        for (let key of keys) {
            const lowerKey = key.toLowerCase();

            // Find open price
            if ((lowerKey.includes('open') && lowerKey.includes('level')) ||
                (lowerKey.includes('open') && lowerKey.includes('price')) ||
                lowerKey === 'open' ||
                lowerKey === 'openlevel') {
                const val = parseFloat(row[key]);
                if (!isNaN(val) && val !== 0) {
                    openPrice = val;
                }
            }

            // Find close price
            if ((lowerKey.includes('close') && lowerKey.includes('level')) ||
                (lowerKey.includes('close') && lowerKey.includes('price')) ||
                lowerKey === 'close' ||
                lowerKey === 'closelevel') {
                const val = parseFloat(row[key]);
                if (!isNaN(val) && val !== 0) {
                    closePrice = val;
                }
            }
        }

        // Calculate points as the absolute difference
        if (openPrice !== 0 && closePrice !== 0) {
            plPoints = Math.abs(closePrice - openPrice);
            // If it's a loss, make points negative
            if (plAmount < 0) {
                plPoints = -plPoints;
            }
        }

        let date = null;
        if (row.DateUtc) {
            date = new Date(row.DateUtc);
        } else if (row.TextDate) {
            date = new Date(row.TextDate);
        }

        // Extract open and close times for duration calculation
        let openTime = null;
        let closeTime = null;

        // Try specific field names first
        if (row['OpenDateUtc']) {
            openTime = new Date(row['OpenDateUtc']);
        } else if (row['OpenTimeUtc']) {
            openTime = new Date(row['OpenTimeUtc']);
        }

        if (row['DateUtc']) {
            closeTime = new Date(row['DateUtc']);
        } else if (row['CloseDateUtc']) {
            closeTime = new Date(row['CloseDateUtc']);
        } else if (row['CloseTimeUtc']) {
            closeTime = new Date(row['CloseTimeUtc']);
        }

        // If not found, search through all keys
        if (!openTime || !closeTime) {
            for (let key of keys) {
                const lowerKey = key.toLowerCase();

                // Find open time/date
                if (!openTime && lowerKey.includes('open')) {
                    if (lowerKey.includes('time') || lowerKey.includes('date') || lowerKey.includes('utc')) {
                        const val = row[key];
                        if (val) {
                            const parsedDate = new Date(val);
                            if (!isNaN(parsedDate.getTime())) {
                                openTime = parsedDate;
                            }
                        }
                    }
                }

                // Find close time/date
                if (!closeTime && lowerKey.includes('close')) {
                    if (lowerKey.includes('time') || lowerKey.includes('date') || lowerKey.includes('utc')) {
                        const val = row[key];
                        if (val) {
                            const parsedDate = new Date(val);
                            if (!isNaN(parsedDate.getTime())) {
                                closeTime = parsedDate;
                            }
                        }
                    }
                }
            }
        }

        // Calculate duration in seconds
        let durationSeconds = 0;
        if (openTime && closeTime && !isNaN(openTime.getTime()) && !isNaN(closeTime.getTime())) {
            durationSeconds = Math.abs(closeTime - openTime) / 1000;
        }

        let marketName = row.MarketName || 'Unknown';
        let baseTicker = marketName;
        if (marketName.includes(' (')) {
            baseTicker = marketName.split(' (')[0].trim();
        } else if (marketName.includes(' converted')) {
            baseTicker = marketName.split(' converted')[0].trim();
        }

        return {
            ...row,
            plAmount,
            plPoints,
            date,
            durationSeconds,
            market: baseTicker,
            originalMarket: marketName,
            year: date ? date.getFullYear() : null,
            reference: row.Reference || ''
        };
    }).filter(row => row.date && !isNaN(row.date.getTime()));

    const uniqueTrades = {};
    cleanData.forEach(row => {
        if (row.reference) {
            if (!uniqueTrades[row.reference] || (row.plAmount !== 0 && uniqueTrades[row.reference].plAmount === 0)) {
                uniqueTrades[row.reference] = row;
            }
        } else {
            uniqueTrades['no-ref-' + Math.random()] = row;
        }
    });

    const deduplicatedData = Object.values(uniqueTrades);
    data = deduplicatedData;

    const marketCounts = {};
    deduplicatedData.forEach(row => {
        const market = row.market;
        if (!marketCounts[market]) {
            marketCounts[market] = 0;
        }
        marketCounts[market] = marketCounts[market] + 1;
    });

    const sortedMarkets = Object.entries(marketCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([market]) => market);

    markets = ['All Markets'].concat(sortedMarkets);
    years = [...new Set(deduplicatedData.map(row => row.year))].sort();

    updateMarketDropdown();
    updateYearDropdown();

    const now = new Date();
    selectedMonth = now.getMonth() + 1;

    calculateSummaries();
}

function calculateSummaries() {
    let dataToProcess = data;
    if (selectedMarket !== 'All Markets') {
        dataToProcess = data.filter(row => row.market === selectedMarket);
    }

    // Weekly data
    const weekly = {};
    dataToProcess.forEach(row => {
        const year = row.date.getFullYear();
        const week = getWeekNumber(row.date);
        const key = `${year}-W${week}`;

        if (!weekly[key]) {
            weekly[key] = { total: 0, trades: 0, year, week };
        }
        weekly[key].total += row.plAmount;
        weekly[key].trades += 1;
    });

    // Monthly data
    const monthly = {};
    dataToProcess.forEach(row => {
        const year = row.date.getFullYear();
        const month = row.date.getMonth() + 1;
        const key = `${year}-M${month}`;

        if (!monthly[key]) {
            monthly[key] = { total: 0, trades: 0, year, month };
        }
        monthly[key].total += row.plAmount;
        monthly[key].trades += 1;
    });

    // Yearly data
    const yearly = {};
    dataToProcess.forEach(row => {
        const year = row.date.getFullYear();
        const key = String(year);

        if (!yearly[key]) {
            yearly[key] = { total: 0, trades: 0, year };
        }
        yearly[key].total += row.plAmount;
        yearly[key].trades += 1;
    });

    // Daily data
    const daily = {};
    dataToProcess.forEach(row => {
        const year = row.date.getFullYear();
        const month = row.date.getMonth() + 1;
        const day = row.date.getDate();
        const key = `${year}-${month}-${day}`;

        if (!daily[key]) {
            daily[key] = { total: 0, trades: 0, year, month, day };
        }
        daily[key].total += row.plAmount;
        daily[key].trades += 1;
    });

    weeklyData = weekly;
    monthlyData = monthly;
    yearlyData = yearly;
    dailyData = daily;

    renderView();
}

function updateMarketDropdown() {
    const marketFilter = document.getElementById('marketFilter');
    marketFilter.innerHTML = markets.map(market =>
        `<option value="${market}" ${market === selectedMarket ? 'selected' : ''}>${market}</option>`
    ).join('');
}

function updateYearDropdown() {
    const yearFilter = document.getElementById('yearFilter');
    yearFilter.innerHTML = years.map(year =>
        `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`
    ).join('');
}

// Render functions
// Calculate OHLC data for P&L progression for a specific day
function calculateDayOHLC(year, month, day) {
    // Get all trades for this day
    let tradesForDay = data.filter(row => {
        if (selectedMarket !== 'All Markets' && row.market !== selectedMarket) {
            return false;
        }
        return row.date.getFullYear() === year &&
               row.date.getMonth() + 1 === month &&
               row.date.getDate() === day;
    });

    if (tradesForDay.length === 0) {
        return null;
    }

    // Sort by close time chronologically
    tradesForDay.sort((a, b) => a.date - b.date);

    // Calculate running cumulative P&L
    let cumulativePL = 0;
    let high = 0;
    let low = 0;

    tradesForDay.forEach((trade, index) => {
        cumulativePL += trade.plAmount;

        if (index === 0) {
            high = cumulativePL;
            low = cumulativePL;
        } else {
            if (cumulativePL > high) high = cumulativePL;
            if (cumulativePL < low) low = cumulativePL;
        }
    });

    return {
        open: 0,
        close: cumulativePL,
        high: high,
        low: low < 0 ? low : 0
    };
}

// Calculate OHLC data for a specific week
function calculateWeekOHLC(year, weekNumber) {
    const key = `${year}-W${weekNumber}`;
    const weekData = weeklyData[key];

    if (!weekData || weekData.trades === 0) {
        return null;
    }

    // Get all trades for this week
    let tradesForWeek = data.filter(row => {
        if (selectedMarket !== 'All Markets' && row.market !== selectedMarket) {
            return false;
        }
        return row.date.getFullYear() === year && getWeekNumber(row.date) === weekNumber;
    });

    if (tradesForWeek.length === 0) {
        return null;
    }

    tradesForWeek.sort((a, b) => a.date - b.date);

    let cumulativePL = 0;
    let high = 0;
    let low = 0;

    tradesForWeek.forEach((trade, index) => {
        cumulativePL += trade.plAmount;
        if (index === 0) {
            high = cumulativePL;
            low = cumulativePL;
        } else {
            if (cumulativePL > high) high = cumulativePL;
            if (cumulativePL < low) low = cumulativePL;
        }
    });

    return {
        open: 0,
        close: cumulativePL,
        high: high,
        low: low < 0 ? low : 0
    };
}

// Calculate OHLC data for a specific month
function calculateMonthOHLC(year, month) {
    const key = `${year}-M${month}`;
    const monthData = monthlyData[key];

    if (!monthData || monthData.trades === 0) {
        return null;
    }

    // Get all trades for this month
    let tradesForMonth = data.filter(row => {
        if (selectedMarket !== 'All Markets' && row.market !== selectedMarket) {
            return false;
        }
        return row.date.getFullYear() === year && row.date.getMonth() + 1 === month;
    });

    if (tradesForMonth.length === 0) {
        return null;
    }

    tradesForMonth.sort((a, b) => a.date - b.date);

    let cumulativePL = 0;
    let high = 0;
    let low = 0;

    tradesForMonth.forEach((trade, index) => {
        cumulativePL += trade.plAmount;
        if (index === 0) {
            high = cumulativePL;
            low = cumulativePL;
        } else {
            if (cumulativePL > high) high = cumulativePL;
            if (cumulativePL < low) low = cumulativePL;
        }
    });

    return {
        open: 0,
        close: cumulativePL,
        high: high,
        low: low < 0 ? low : 0
    };
}

// Calculate OHLC data for a specific year
function calculateYearOHLC(year) {
    const key = String(year);
    const yearData = yearlyData[key];

    if (!yearData || yearData.trades === 0) {
        return null;
    }

    // Get all trades for this year
    let tradesForYear = data.filter(row => {
        if (selectedMarket !== 'All Markets' && row.market !== selectedMarket) {
            return false;
        }
        return row.date.getFullYear() === year;
    });

    if (tradesForYear.length === 0) {
        return null;
    }

    tradesForYear.sort((a, b) => a.date - b.date);

    let cumulativePL = 0;
    let high = 0;
    let low = 0;

    tradesForYear.forEach((trade, index) => {
        cumulativePL += trade.plAmount;
        if (index === 0) {
            high = cumulativePL;
            low = cumulativePL;
        } else {
            if (cumulativePL > high) high = cumulativePL;
            if (cumulativePL < low) low = cumulativePL;
        }
    });

    return {
        open: 0,
        close: cumulativePL,
        high: high,
        low: low < 0 ? low : 0
    };
}

// Universal candlestick renderer - same size for all views
function renderCandlestick(ohlc, label) {
    const height = 1875;
    const padding = 156.25;
    const centerX = 50;
    const bodyWidth = 60;

    if (!ohlc) {
        return `
            <svg viewBox="0 0 100 ${height}" class="w-full h-auto bg-white" preserveAspectRatio="xMidYMid meet">
                <text x="${centerX}" y="${height - 5}" text-anchor="middle" font-size="8" fill="#9ca3af">${label}</text>
            </svg>
        `;
    }

    const { open, close, high, low } = ohlc;
    const isPositive = close >= open;
    const bodyColor = isPositive ? '#16a34a' : '#dc2626';
    const wickColor = isPositive ? '#15803d' : '#b91c1c';

    const range = Math.max(Math.abs(high), Math.abs(low));
    const scale = range > 0 ? (height - 2 * padding - 156.25) / (range * 2) : 1;
    const centerY = height / 2;

    const openY = centerY - (open * scale);
    const closeY = centerY - (close * scale);
    const highY = centerY - (high * scale);
    const lowY = centerY - (low * scale);

    const bodyTop = Math.min(openY, closeY);
    const bodyBottom = Math.max(openY, closeY);
    const bodyHeight = Math.max(bodyBottom - bodyTop, 2);

    return `
        <svg viewBox="0 0 100 ${height}" class="w-full h-auto bg-white rounded border border-gray-200" preserveAspectRatio="xMidYMid meet">
            <line x1="0" y1="${centerY}" x2="100" y2="${centerY}" stroke="#e5e7eb" stroke-width="5" stroke-dasharray="25,25"/>
            <line x1="${centerX}" y1="${highY}" x2="${centerX}" y2="${bodyTop}" stroke="${wickColor}" stroke-width="17.5"/>
            <line x1="${centerX}" y1="${bodyBottom}" x2="${centerX}" y2="${lowY}" stroke="${wickColor}" stroke-width="17.5"/>
            <rect x="${centerX - bodyWidth/2}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" fill="${bodyColor}" stroke="${bodyColor}" stroke-width="7.5" rx="20"/>
            <text x="95" y="${highY - 25}" text-anchor="end" font-size="25" fill="#6b7280">H: ${Math.round(high)}</text>
            <text x="95" y="${lowY + 40}" text-anchor="end" font-size="25" fill="#6b7280">L: ${Math.round(low)}</text>
            <text x="${centerX}" y="${height - 162.5}" text-anchor="middle" font-size="32.5" font-weight="bold" fill="${isPositive ? '#15803d' : '#b91c1c'}">${close >= 0 ? '+' : ''}${Math.round(close)}</text>
            <text x="${centerX}" y="${height - 37.5}" text-anchor="middle" font-size="27.5" fill="#6b7280">${label}</text>
        </svg>
    `;
}

function renderDailyViewHeader() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const monthKey = `${selectedYear}-M${selectedMonth}`;
    const monthTotal = monthlyData[monthKey]?.total || 0;

    return `
        <div class="bg-white rounded-t-2xl mt-2 sm:mt-3 md:mt-4 p-4 sm:p-6 pb-4">
            <div class="flex items-center justify-between">
                <button onclick="changeMonth(-1)" class="p-1 sm:p-1.5 hover:bg-gray-100 rounded-md transition-all">
                    <svg class="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
                <div class="text-center">
                    <h2 class="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-700">${monthNames[selectedMonth - 1]} ${selectedYear}</h2>
                    <div class="text-xs sm:text-sm md:text-base lg:text-lg font-bold mt-0.5 ${monthTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                        Total: ${monthTotal >= 0 ? '' : '-'}${Math.abs(monthTotal).toFixed(0)}
                    </div>
                </div>
                <button onclick="changeMonth(1)" class="p-1 sm:p-1.5 hover:bg-gray-100 rounded-md transition-all">
                    <svg class="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function renderDailyView() {
    const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    let html = `
        <div class="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-1.5 mb-1">
            ${daysOfWeek.map(day => `<div class="text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-center font-semibold text-gray-500 py-0.5">${day}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 overflow-auto">
    `;

    // Empty cells before month starts
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div></div>';
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const key = `${selectedYear}-${selectedMonth}-${day}`;
        const dayData = dailyData[key];

        let bgClass = 'bg-gray-50 hover:bg-gray-100';
        let textColorClass = 'text-gray-400';
        let content = '';

        if (dayData) {
            bgClass = dayData.total >= 0 ? 'bg-green-100 hover:bg-green-200' : 'bg-red-100 hover:bg-red-200';
            textColorClass = dayData.total >= 0 ? 'text-green-700' : 'text-red-700';
            content = `
                <div class="text-xs sm:text-xs md:text-sm lg:text-base font-bold ${textColorClass} leading-tight">
                    ${dayData.total >= 0 ? '' : '-'}${Math.abs(dayData.total).toFixed(0)}
                </div>
                <div class="text-[8px] sm:text-[7px] md:text-[8px] lg:text-[9px] text-gray-500 mt-0.5">T:${dayData.trades}</div>
            `;
        } else {
            content = `
                <div class="text-xs sm:text-xs md:text-sm lg:text-base font-bold invisible">$0</div>
                <div class="text-[8px] sm:text-[7px] md:text-[8px] lg:text-[9px] text-gray-500 mt-0.5 invisible">T:0</div>
            `;
        }

        html += `
            <div onclick="handleDayClick(${selectedYear}, ${selectedMonth}, ${day})" class="${bgClass} rounded-lg sm:rounded-xl p-1.5 sm:p-3 md:p-4 flex flex-col items-center justify-center min-h-[60px] sm:min-h-[90px] md:min-h-[100px] transition-all cursor-pointer shadow-sm hover:shadow-md">
                <div class="text-xs sm:text-xs md:text-sm font-semibold mb-0.5 text-gray-700">${day}</div>
                ${content}
            </div>
        `;
    }

    html += '</div>';

    return html;
}

function renderMonthlyCandlestickChart() {
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const daysInMonth = lastDay.getDate();

    let html = '<div class="bg-white rounded-2xl shadow-lg p-2 sm:p-4 md:p-6">';
    html += '<div class="text-base sm:text-lg md:text-xl font-bold text-gray-700 mb-3 sm:mb-4 text-center">Monthly P&L Chart</div>';
    html += '<div class="flex gap-0.5 sm:gap-1">';

    for (let day = 1; day <= daysInMonth; day++) {
        const ohlc = calculateDayOHLC(selectedYear, selectedMonth, day);
        html += `
            <div class="flex-1 min-w-0">
                ${renderCandlestick(ohlc, day)}
            </div>
        `;
    }

    html += '</div></div>';

    return html;
}

function renderWeeklyCandlestickChart() {
    let html = '<div class="bg-white rounded-2xl shadow-lg p-2 sm:p-4 md:p-6">';
    html += '<div class="text-base sm:text-lg md:text-xl font-bold text-gray-700 mb-3 sm:mb-4 text-center">Weekly P&L Chart</div>';
    html += '<div class="flex gap-0.5 sm:gap-1">';

    for (let week = 1; week <= 52; week++) {
        const ohlc = calculateWeekOHLC(selectedYear, week);
        html += `
            <div class="flex-1 min-w-0">
                ${renderCandlestick(ohlc, week)}
            </div>
        `;
    }

    html += '</div></div>';

    return html;
}

function renderMonthlyYearCandlestickChart() {
    let html = '<div class="bg-white rounded-2xl shadow-lg p-2 sm:p-4 md:p-6">';
    html += '<div class="text-base sm:text-lg md:text-xl font-bold text-gray-700 mb-3 sm:mb-4 text-center">Monthly P&L Chart</div>';
    html += '<div class="flex gap-0.5 sm:gap-1">';

    for (let month = 1; month <= 12; month++) {
        const ohlc = calculateMonthOHLC(selectedYear, month);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        html += `
            <div class="flex-1 min-w-0">
                ${renderCandlestick(ohlc, monthNames[month - 1])}
            </div>
        `;
    }

    html += '</div></div>';

    return html;
}

function renderYearlyCandlestickChart() {
    const startYear = Math.min(...years);
    const endYear = Math.max(...years);
    const yearCount = endYear - startYear + 1;

    let html = '<div class="bg-white rounded-2xl shadow-lg p-2 sm:p-4 md:p-6">';
    html += '<div class="text-base sm:text-lg md:text-xl font-bold text-gray-700 mb-3 sm:mb-4 text-center">Yearly P&L Chart</div>';
    html += '<div class="flex gap-0.5 sm:gap-1">';

    for (let year = startYear; year <= endYear; year++) {
        const ohlc = calculateYearOHLC(year);
        html += `
            <div class="flex-1 min-w-0">
                ${renderCandlestick(ohlc, year)}
            </div>
        `;
    }

    html += '</div></div>';

    return html;
}

function renderWeekView() {
    let html = `
        <div class="flex items-center justify-between mb-2 sm:mb-3">
            <button class="p-1 sm:p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-all transform hover:scale-110 active:scale-95">
                <svg class="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
            </button>
            <h2 class="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-700">${selectedYear}</h2>
            <button class="p-1 sm:p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-all transform hover:scale-110 active:scale-95">
                <svg class="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        </div>

        <h3 class="text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-center font-semibold text-gray-500 mb-2 tracking-wider">WEEK</h3>

        <div class="grid gap-1 sm:gap-1.5 md:gap-2 overflow-y-auto" style="grid-template-columns: repeat(6, minmax(0, 1fr));">
    `;

    for (let i = 1; i <= 52; i++) {
        const key = `${selectedYear}-W${i}`;
        const weekData = weeklyData[key];

        let bgClass = 'bg-gray-50 hover:bg-gray-100';
        let content = '';

        if (weekData) {
            bgClass = weekData.total >= 0 ? 'bg-green-100 hover:bg-green-200' : 'bg-red-100 hover:bg-red-200';
            const textColor = weekData.total >= 0 ? 'text-green-700' : 'text-red-700';
            content = `
                <div class="text-xs sm:text-xs md:text-sm font-bold ${textColor} leading-tight">
                    ${weekData.total >= 0 ? '' : '-'}${Math.abs(weekData.total).toFixed(0)}
                </div>
                <div class="text-[8px] sm:text-[7px] md:text-[8px] text-gray-500 mt-0.5">T:${weekData.trades}</div>
            `;
        } else {
            content = '<div class="text-[10px] text-gray-300">-</div>';
        }

        html += `
            <div onclick="handleWeekClick(${i})" class="${bgClass} rounded-lg sm:rounded-xl p-1.5 sm:p-3 md:p-4 flex flex-col items-center justify-center min-h-[60px] sm:min-h-[90px] md:min-h-[100px] transition-all cursor-pointer shadow-sm hover:shadow-md">
                <div class="text-xs sm:text-xs md:text-sm font-semibold text-gray-700 mb-0.5">${i}</div>
                ${content}
            </div>
        `;
    }

    html += '</div>';
    return html;
}

function renderMonthView() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let html = `
        <div class="flex items-center justify-between mb-2 sm:mb-3">
            <button class="p-1 sm:p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-all transform hover:scale-110 active:scale-95">
                <svg class="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
            </button>
            <h2 class="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-700">${selectedYear}</h2>
            <button class="p-1 sm:p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-all transform hover:scale-110 active:scale-95">
                <svg class="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        </div>

        <h3 class="text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-center font-semibold text-gray-500 mb-2 tracking-wider">MONTH</h3>

        <div class="grid gap-2 sm:gap-2.5 md:gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6">
    `;

    months.forEach((month, index) => {
        const key = `${selectedYear}-M${index + 1}`;
        const monthData = monthlyData[key];

        let bgClass = 'bg-gray-50 hover:bg-gray-100';
        let content = '<div class="text-gray-300 text-base">-</div>';

        if (monthData) {
            bgClass = monthData.total >= 0 ? 'bg-green-100 hover:bg-green-200' : 'bg-red-100 hover:bg-red-200';
            const textColor = monthData.total >= 0 ? 'text-green-700' : 'text-red-700';
            content = `
                <div class="text-xs sm:text-xs md:text-sm lg:text-base font-bold ${textColor}">
                    ${monthData.total >= 0 ? '' : '-'}${Math.abs(monthData.total).toFixed(0)}
                </div>
                <div class="text-[8px] sm:text-[7px] md:text-[8px] lg:text-[9px] text-gray-500 mt-1">T:${monthData.trades}</div>
            `;
        }

        html += `
            <div onclick="handleMonthClick(${index})" class="${bgClass} rounded-lg sm:rounded-xl md:rounded-2xl p-2 sm:p-3 md:p-4 flex flex-col items-center justify-center min-h-[60px] sm:min-h-[70px] md:min-h-[80px] transition-all cursor-pointer transform hover:scale-105 shadow-sm hover:shadow-md">
                <div class="text-xs sm:text-xs md:text-sm lg:text-base font-semibold text-gray-700 mb-1">${month}</div>
                ${content}
            </div>
        `;
    });

    html += '</div>';
    return html;
}

function renderYearView() {
    const startYear = Math.min(...years);
    const endYear = Math.max(...years);

    let html = `
        <div class="flex items-center justify-between mb-3 sm:mb-4">
            <button class="p-1 sm:p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-all transform hover:scale-110 active:scale-95">
                <svg class="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
            </button>
            <h2 class="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-700">All Years</h2>
            <button class="p-1 sm:p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-all transform hover:scale-110 active:scale-95">
                <svg class="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        </div>

        <h3 class="text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-center font-semibold text-gray-500 mb-2 sm:mb-3 tracking-wider">YEAR</h3>

        <div class="grid gap-2 sm:gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    `;

    for (let year = startYear; year <= endYear; year++) {
        const key = String(year);
        const yearData = yearlyData[key];

        let bgClass = 'bg-gray-50 hover:bg-gray-100';
        let content = '<div class="text-gray-300 text-lg">-</div>';

        if (yearData) {
            bgClass = yearData.total >= 0 ? 'bg-green-100 hover:bg-green-200' : 'bg-red-100 hover:bg-red-200';
            const textColor = yearData.total >= 0 ? 'text-green-700' : 'text-red-700';
            content = `
                <div class="text-xs sm:text-xs md:text-sm lg:text-base font-bold ${textColor}">
                    ${yearData.total >= 0 ? '' : '-'}${Math.abs(yearData.total).toFixed(0)}
                </div>
                <div class="text-[8px] sm:text-[7px] md:text-[8px] lg:text-[9px] text-gray-500 mt-1">T:${yearData.trades}</div>
            `;
        }

        html += `
            <div onclick="handleYearClick(${year})" class="${bgClass} rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 flex flex-col items-center justify-center min-h-[80px] sm:min-h-[90px] md:min-h-[100px] transition-all cursor-pointer transform hover:scale-105 shadow-sm hover:shadow-md">
                <div class="text-xs sm:text-xs md:text-sm lg:text-base font-semibold text-gray-700 mb-1.5">${year}</div>
                ${content}
            </div>
        `;
    }

    html += '</div>';
    return html;
}

function renderView() {
    const noDataMessage = document.getElementById('noDataMessage');
    const calendarContent = document.getElementById('calendarContent');
    const viewHeader = document.getElementById('viewHeader');

    if (data.length === 0) {
        noDataMessage.classList.remove('hidden');
        calendarContent.classList.add('hidden');
        if (viewHeader) viewHeader.innerHTML = '';
        return;
    }

    noDataMessage.classList.add('hidden');
    calendarContent.classList.remove('hidden');

    let html = '';
    let headerHtml = '';

    switch (currentView) {
        case 'Daily':
            headerHtml = renderDailyViewHeader();
            // Wrap calendar and candlestick chart in separate tiles
            html = `
                <div class="space-y-6 sm:space-y-8">
                    <div class="bg-white rounded-b-2xl shadow-lg p-4 sm:p-6 pt-0">
                        ${renderDailyView()}
                    </div>
                    ${renderMonthlyCandlestickChart()}
                </div>
            `;
            break;
        case 'Week':
            headerHtml = '';
            html = `
                <div class="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
                    ${renderWeekView()}
                </div>
            `;
            break;
        case 'Month':
            headerHtml = '';
            html = `
                <div class="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
                    ${renderMonthView()}
                </div>
            `;
            break;
        case 'Year':
            headerHtml = '';
            html = `
                <div class="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
                    ${renderYearView()}
                </div>
            `;
            break;
    }

    if (viewHeader) viewHeader.innerHTML = headerHtml;
    calendarContent.innerHTML = html;
}

// Event handlers
function changeMonth(delta) {
    if (delta > 0) {
        if (selectedMonth === 12) {
            selectedMonth = 1;
            selectedYear = selectedYear + 1;
        } else {
            selectedMonth = selectedMonth + 1;
        }
    } else {
        if (selectedMonth === 1) {
            selectedMonth = 12;
            selectedYear = selectedYear - 1;
        } else {
            selectedMonth = selectedMonth - 1;
        }
    }
    renderView();
}

function handleWeekClick(weekNumber) {
    const startOfYear = new Date(selectedYear, 0, 1);
    const daysToWeek = (weekNumber - 1) * 7;
    const weekDate = new Date(startOfYear.getTime() + daysToWeek * 24 * 60 * 60 * 1000);
    selectedMonth = weekDate.getMonth() + 1;
    currentView = 'Daily';
    updateViewButtons();
    renderView();
}

function handleMonthClick(monthIndex) {
    selectedMonth = monthIndex + 1;
    currentView = 'Daily';
    updateViewButtons();
    renderView();
}

function handleYearClick(year) {
    selectedYear = year;
    currentView = 'Month';
    updateViewButtons();
    renderView();
}

function updateViewButtons() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        if (btn.dataset.view === currentView) {
            btn.className = 'view-btn flex-1 py-1.5 sm:py-2 md:py-2.5 px-2 sm:px-3 md:px-4 rounded-md sm:rounded-lg font-semibold text-xs sm:text-sm md:text-base transition-all bg-white text-gray-900 shadow-md';
        } else {
            btn.className = 'view-btn flex-1 py-1.5 sm:py-2 md:py-2.5 px-2 sm:px-3 md:px-4 rounded-md sm:rounded-lg font-semibold text-xs sm:text-sm md:text-base transition-all text-gray-600 hover:text-gray-900 hover:bg-gray-50';
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // File upload handler
    document.getElementById('csvFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                processData(results.data);
            },
            error: (error) => {
                console.error('Error parsing file:', error);
            }
        });
    });

    // Market filter
    document.getElementById('marketFilter').addEventListener('change', (e) => {
        selectedMarket = e.target.value;
        calculateSummaries();
    });

    // Year filter
    document.getElementById('yearFilter').addEventListener('change', (e) => {
        selectedYear = Number(e.target.value);
        renderView();
    });

    // View buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentView = btn.dataset.view;
            updateViewButtons();
            renderView();
        });
    });

});

// Modal functions
function handleDayClick(year, month, day) {
    const key = `${year}-${month}-${day}`;
    const dayData = dailyData[key];

    if (!dayData || dayData.trades === 0) {
        return; // Don't show modal for days with no trades
    }

    // Get all trades for this day
    let tradesForDay = data.filter(row => {
        if (selectedMarket !== 'All Markets' && row.market !== selectedMarket) {
            return false;
        }
        return row.date.getFullYear() === year &&
               row.date.getMonth() + 1 === month &&
               row.date.getDate() === day;
    });

    // Group trades by market
    const tradesByMarket = {};
    tradesForDay.forEach(trade => {
        const market = trade.market;
        if (!tradesByMarket[market]) {
            tradesByMarket[market] = {
                trades: [],
                total: 0,
                points: 0,
                count: 0
            };
        }
        tradesByMarket[market].trades.push(trade);
        tradesByMarket[market].total += trade.plAmount;
        tradesByMarket[market].points += trade.plPoints;
        tradesByMarket[market].count += 1;
    });

    // Sort markets by total profit/loss
    const sortedMarkets = Object.entries(tradesByMarket)
        .sort((a, b) => b[1].total - a[1].total);

    showModal(year, month, day, dayData, sortedMarkets);
}

function showModal(year, month, day, dayData, sortedMarkets) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Set date
    document.getElementById('modalDate').textContent = `${monthNames[month - 1]} ${day}, ${year}`;

    // Set summary
    const totalColor = dayData.total >= 0 ? 'text-green-600' : 'text-red-600';
    const totalBgColor = dayData.total >= 0 ? 'bg-green-100' : 'bg-red-100';
    document.getElementById('modalSummary').innerHTML = `
        <div class="text-base sm:text-lg text-gray-700">Total Trades: <span class="font-semibold">${dayData.trades}</span></div>
        <div class="${totalBgColor} ${totalColor} px-3 py-1.5 rounded-lg font-bold text-lg sm:text-xl">
            ${dayData.total >= 0 ? '' : '-'}$${Math.abs(dayData.total).toFixed(0)}
        </div>
    `;

    // Set trade list
    let tradeListHtml = '';
    sortedMarkets.forEach(([market, marketData]) => {
        const textColor = marketData.total >= 0 ? 'text-green-700' : 'text-red-700';
        const bgColor = marketData.total >= 0 ? 'bg-green-50' : 'bg-red-50';
        const icon = marketData.total >= 0 ? '↑' : '↓';

        tradeListHtml += `
            <div onclick="showIndividualTrades('${market.replace(/'/g, "\\'")}', ${year}, ${month}, ${day})" class="${bgColor} rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all">
                <div class="flex items-start justify-between">
                    <div class="flex items-start gap-3">
                        <div class="text-2xl ${textColor}">${icon}</div>
                        <div>
                            <div class="font-bold text-base sm:text-lg text-gray-900">${market}</div>
                            <div class="text-sm text-gray-600">${marketData.count} trade${marketData.count > 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="${textColor} font-bold text-lg sm:text-xl">
                            ${marketData.total >= 0 ? '' : '-'}$${Math.abs(marketData.total).toFixed(0)}
                        </div>
                        <div class="text-sm text-gray-500">
                            ${Math.abs(marketData.points).toFixed(0)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    document.getElementById('modalTradeList').innerHTML = tradeListHtml;

    // Show modal
    document.getElementById('tradingDetailsModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('tradingDetailsModal').classList.add('hidden');
}

// Show individual trades for a specific market
function showIndividualTrades(market, year, month, day) {
    // Get all trades for this market on this day
    let tradesForMarket = data.filter(row => {
        if (selectedMarket !== 'All Markets' && row.market !== selectedMarket) {
            return false;
        }
        return row.market === market &&
               row.date.getFullYear() === year &&
               row.date.getMonth() + 1 === month &&
               row.date.getDate() === day;
    });

    // Sort by time (oldest first)
    tradesForMarket.sort((a, b) => a.date - b.date);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Update modal header with back button
    document.getElementById('modalDate').innerHTML = `
        <button onclick="handleDayClick(${year}, ${month}, ${day})" class="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-2">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Back to Day Summary
        </button>
        <div>${monthNames[month - 1]} ${day}, ${year} - ${market}</div>
    `;

    // Calculate totals
    const totalAmount = tradesForMarket.reduce((sum, t) => sum + t.plAmount, 0);
    const totalPoints = tradesForMarket.reduce((sum, t) => sum + t.plPoints, 0);

    // Update summary
    const totalColor = totalAmount >= 0 ? 'text-green-600' : 'text-red-600';
    const totalBgColor = totalAmount >= 0 ? 'bg-green-100' : 'bg-red-100';
    document.getElementById('modalSummary').innerHTML = `
        <div class="text-base sm:text-lg text-gray-700">Total Trades: <span class="font-semibold">${tradesForMarket.length}</span></div>
        <div class="${totalBgColor} ${totalColor} px-3 py-1.5 rounded-lg font-bold text-lg sm:text-xl">
            ${totalAmount >= 0 ? '' : '-'}$${Math.abs(totalAmount).toFixed(0)}
        </div>
    `;

    // Build individual trade list
    let tradeListHtml = '';
    tradesForMarket.forEach((trade, index) => {
        const textColor = trade.plAmount >= 0 ? 'text-green-700' : 'text-red-700';
        const bgColor = trade.plAmount >= 0 ? 'bg-green-50' : 'bg-red-50';
        const icon = trade.plAmount >= 0 ? '↑' : '↓';

        // Format duration as HH:MM:SS
        const totalSeconds = Math.floor(trade.durationSeconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        tradeListHtml += `
            <div class="${bgColor} rounded-xl p-4 shadow-sm">
                <div class="flex items-start justify-between">
                    <div class="flex items-start gap-3">
                        <div class="text-2xl ${textColor}">${icon}</div>
                        <div>
                            <div class="font-bold text-base sm:text-lg text-gray-900">Trade #${index + 1}</div>
                            <div class="text-sm text-gray-500">${durationStr}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="${textColor} font-bold text-lg sm:text-xl">
                            ${trade.plAmount >= 0 ? '' : '-'}$${Math.abs(trade.plAmount).toFixed(0)}
                        </div>
                        <div class="text-sm text-gray-500">
                            ${Math.abs(trade.plPoints).toFixed(0)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    document.getElementById('modalTradeList').innerHTML = tradeListHtml;
}
