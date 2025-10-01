// ----------------------
// Math & indicators
// ----------------------
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const stddev = (arr) => {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map((x) => (x - m) ** 2)));
};
const SMA = (arr, n) => (arr.length >= n ? avg(arr.slice(-n)) : null);
const EMA = (arr, n) => {
  if (arr.length < n) return null;
  const k = 2 / (n + 1);
  let ema = avg(arr.slice(0, n));
  for (let i = n; i < arr.length; i++) {
    ema = arr[i] * k + ema * (1 - k);
  }
  return ema;
};
const RSI = (series, period = 14) => {
  if (series.length < period + 1) return null;
  let gains = 0,
    losses = 0;
  for (let i = series.length - period; i < series.length; i++) {
    const change = series[i] - series[i - 1];
    if (change >= 0) gains += change;
    else losses += -change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};
const MACD = (series, fast = 12, slow = 26, signal = 9) => {
  if (series.length < slow + signal) return null;
  const fastEMA = EMA(series, fast);
  const slowEMA = EMA(series, slow);
  if (!fastEMA || !slowEMA) return null;
  const macdLine = fastEMA - slowEMA;
  const macdSeries = [];
  for (let i = slow; i < series.length; i++) {
    const slice = series.slice(0, i + 1);
    const f = EMA(slice, fast);
    const s = EMA(slice, slow);
    if (f != null && s != null) macdSeries.push(f - s);
  }
  if (macdSeries.length < signal) return null;
  const signalLine = EMA(macdSeries, signal);
  const histogram = macdLine - signalLine;
  return { macdLine, signalLine, histogram };
};
const Bollinger = (series, period = 20, mult = 2) => {
  if (series.length < period) return null;
  const slice = series.slice(-period);
  const mid = avg(slice);
  const sd = stddev(slice);
  return { upper: mid + mult * sd, mid, lower: mid - mult * sd, sd };
};

// ----------------------
// Helper for K, M, B, T formatting
// ----------------------
function formatNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return Number(num).toFixed(2);
}

// ----------------------
// Fetch & render
// ----------------------
let currentSort = { index: 6, ascending: false }; // default sort: 24h % descending

async function fetchData() {
  try {
    const res = await fetch("/api/fetch-coins");

    try {
      const clone = res.clone();
      const headersObj = Object.fromEntries(clone.headers.entries());
      const ct = clone.headers.get("content-type") || "";
      let body = null;
      if (ct.includes("application/json")) {
        body = await clone.json().catch(() => null);
      } else {
        body = await clone.text().catch(() => null);
      }
      console.log("Fetch response:", {
        url: "/api/fetch-coins",
        status: res.status,
        statusText: res.statusText,
        headers: headersObj,
        body,
      });
    } catch (logErr) {
      console.warn("Failed to log response body:", logErr);
    }

    // Fail fast on non-OK responses and log details
    if (!res.ok) {
      console.error("Fetch failed:", res.status, res.statusText);
      return;
    }

    const data = await res.json();

    // Normalize coins to support both array and object shapes.
    if (!data) {
      console.error("Invalid data from /api/fetch-coins: null/undefined");
      return;
    }
    let coins = [];
    if (Array.isArray(data.coins)) {
      coins = data.coins;
    } else if (data.coins && typeof data.coins === "object") {
      // object keyed by id -> convert to array
      coins = Object.values(data.coins);
    } else {
      console.error("Invalid data.coins shape from /api/fetch-coins:", data.coins);
      return;
    }
    const { timestamp } = data;

    // Log the full JSON data to the browser console
    console.log("Fetched JSON data:", { timestamp, coins });

    // Update timestamp (upper-right) only if present
    if (timestamp) {
      const tsEl = document.getElementById("timestamp");
      if (tsEl) tsEl.textContent = "Last update: " + new Date(timestamp).toLocaleString();
    }

    const tbody = document.querySelector("#cryptoTable tbody");

    // Clear only after successful fetch + validation
    tbody.innerHTML = "";

    // Default sort on first fetch (only if user hasn't chosen a sort yet)
    if (!localStorage.getItem("cryptoSort")) {
      coins.sort(
        (a, b) =>
          (b.price_change_percentage_24h || 0) -
          (a.price_change_percentage_24h || 0)
      );
    }

    // Render each row, but trap errors per-coin so one bad record doesn't wipe everything
    coins.forEach((coin) => {
      try {
        const row = document.createElement("tr");

        // --- Watch column ---
        const watchCell = document.createElement("td");
        watchCell.className = "watch-cell";
        watchCell.innerHTML = `<span class="watch-icon" title="Watch">&#128065;</span>`;

        // 7-day first value (start) and current price (end)
        let first7d = null;
        if (coin.sparkline_in_7d?.price?.length > 1) {
          first7d = coin.sparkline_in_7d.price[0];
        }
        const curr = coin.current_price;
        const trendPct7d = first7d ? ((curr - first7d) / first7d) * 100 : 0;

        // Raw data stored for sorting (use safe defaults)
        row.dataset.raw = JSON.stringify({
          name: coin.name || "",
          id: coin.id || "",
          symbol: (coin.symbol || "").toUpperCase(),
          price: typeof coin.current_price === "number" ? coin.current_price : 0,
          marketCap: typeof coin.market_cap === "number" ? coin.market_cap : 0,
          volume: typeof coin.total_volume === "number" ? coin.total_volume : 0,
          pct24h: typeof coin.price_change_percentage_24h === "number" ? coin.price_change_percentage_24h : 0,
          signal: typeof coin.price_change_percentage_24h === "number" ? coin.price_change_percentage_24h : 0,
          trendPct: trendPct7d,
        });

        // Columns (do NOT append watchCell yet)
        row.innerHTML += `<td>${coin.name || ""}</td>`;
        row.innerHTML += `<td>${coin.id || ""}</td>`;
        row.innerHTML += `<td>${(coin.symbol || "").toUpperCase()}</td>`;
        row.innerHTML += `<td>$${formatNumber(coin.current_price || 0)}</td>`;
        row.innerHTML += `<td>$${formatNumber(coin.market_cap || 0)}</td>`;
        row.innerHTML += `<td>${formatNumber(coin.total_volume || 0)}</td>`;

        // 24h %
        const pct = typeof coin.price_change_percentage_24h === "number" ? coin.price_change_percentage_24h : 0;
        const pctCell = document.createElement("td");
        pctCell.textContent = pct.toFixed(2) + "%";
        if (pct >= 5) pctCell.style.color = "green";
        else if (pct <= -5) pctCell.style.color = "red";
        else pctCell.style.color = "grey";
        row.appendChild(pctCell);

        // 7-day trend up/down flags (based on first7d -> current)
        let trendUp = false;
        let trendDown = false;
        if (first7d != null) {
          trendUp = trendPct7d >= 1;
          trendDown = trendPct7d <= -1;
        }

        // Signal arrows with existing logic, but compare against current price
        const signalCell = document.createElement("td");
        const boll = Bollinger(coin.sparkline_in_7d?.price || []);
        if (boll && pct >= 2 && trendUp && curr > boll.upper) {
          signalCell.textContent = "⬆⬆ Strong Buy";
          signalCell.style.color = "lime";
        } else if (pct >= 5) {
          signalCell.textContent = "⬆ Buy";
          signalCell.style.color = "darkgreen";
        } else if (boll && pct <= -2 && trendDown && curr < boll.lower) {
          signalCell.textContent = "⬇⬇ Strong Sell";
          signalCell.style.color = "red";
        } else if (pct <= -1) {
          signalCell.textContent = "⬇ Sell";
          signalCell.style.color = "darkred";
        } else {
          signalCell.textContent = "–";
          signalCell.style.color = "black";
        }
        row.appendChild(signalCell);

        // 7-Day Trend column (show start -> current price)
        const trendCell = document.createElement("td");
        if (first7d != null) {
          trendCell.textContent = `${first7d.toFixed(2)} → ${curr.toFixed(2)}`;
          if (Math.abs(trendPct7d) < 1) trendCell.className = "trend-neutral";
          else trendCell.className = curr > first7d ? "trend-up" : "trend-down";
        } else {
          trendCell.textContent = "-";
          trendCell.className = "trend-neutral";
        }
        row.appendChild(trendCell);

        // Insert the watch cell as the first cell
        row.insertBefore(watchCell, row.firstChild);

        // --- Watch icon click logic ---
        const watchedIds = getWatchedIds();
        if (watchedIds.includes(coin.id)) {
          watchCell.querySelector(".watch-icon").classList.add("watched");
          row.classList.add("watched-row");
        }
        watchCell.querySelector(".watch-icon").addEventListener("click", function (e) {
          e.stopPropagation();
          const icon = this;
          const isWatched = icon.classList.toggle("watched");
          let ids = getWatchedIds();
          if (isWatched) {
            row.classList.add("watched-row");
            if (!ids.includes(coin.id)) ids.push(coin.id);
          } else {
            row.classList.remove("watched-row");
            ids = ids.filter((id) => id !== coin.id);
          }
          setWatchedIds(ids);
        });

        tbody.appendChild(row);
      } catch (err) {
        console.error("Error rendering coin:", coin && coin.id, err);
        // continue rendering other coins
      }
    });

    // Apply saved sort if present
    if (localStorage.getItem("cryptoSort")) {
      sortTableBy(currentSort.index, true); // true = don't toggle direction
    } else {
      applySortingUI();
    }
  } catch (err) {
    console.error("Error fetching coins:", err);
  }
}

// ----------------------
// Sorting
// ----------------------

// Load sort state from localStorage if present
function loadSortState() {
  const saved = localStorage.getItem("cryptoSort");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (
        typeof parsed.index === "number" &&
        typeof parsed.ascending === "boolean"
      ) {
        currentSort = parsed;
      }
    } catch {}
  }
}

// Save sort state to localStorage
function saveSortState() {
  localStorage.setItem("cryptoSort", JSON.stringify(currentSort));
}

function sortTableBy(index, keepDirection = false) {
  // Prevent sorting for Watch (0) and Signal (8) columns
  if (index === 0 || index === 8) return;

  const tbody = document.querySelector("#cryptoTable tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));

  if (currentSort.index === index && !keepDirection) currentSort.ascending = !currentSort.ascending;
  else if (!keepDirection) {
    currentSort.index = index;
    currentSort.ascending = false;
  } else {
    currentSort.index = index;
    // keep currentSort.ascending as is
  }
  saveSortState(); // Save after changing sort

  rows.sort((a, b) => {
    const rawA = JSON.parse(a.dataset.raw);
    const rawB = JSON.parse(b.dataset.raw);
    let valA, valB;
    switch (index) {
      case 1: valA = rawA.name;      valB = rawB.name; break;
      case 2: valA = rawA.id;        valB = rawB.id; break;
      case 3: valA = rawA.symbol;    valB = rawB.symbol; break;
      case 4: valA = rawA.price;     valB = rawB.price; break;
      case 5: valA = rawA.marketCap; valB = rawB.marketCap; break;
      case 6: valA = rawA.volume;    valB = rawB.volume; break;
      case 7: valA = rawA.pct24h;    valB = rawB.pct24h; break;
      // case 8 intentionally omitted (Signal)
      case 9: valA = rawA.trendPct;  valB = rawB.trendPct; break;
      default: return 0;
    }

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      return currentSort.ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return currentSort.ascending ? valA - valB : valB - valA;
    }
  });

  tbody.innerHTML = "";
  rows.forEach((r) => tbody.appendChild(r));
  applySortingUI();
}

function applySortingUI() {
  document.querySelectorAll("#cryptoTable thead th").forEach((th, i) => {
    const arrow = th.querySelector(".sort-arrow");
    if (i === currentSort.index) arrow.textContent = currentSort.ascending ? "▲" : "▼";
    else arrow.textContent = "";
    // Only show pointer for sortable columns
    if (i === 0 || i === 8) th.style.cursor = "default";
    else th.style.cursor = "pointer";
  });
}

// Attach header click events
document.querySelectorAll("#cryptoTable thead th").forEach((th, i) => {
  th.addEventListener("click", () => sortTableBy(i));
});

function getWatchedIds() {
  return JSON.parse(localStorage.getItem("watchedCoins") || "[]");
}
function setWatchedIds(ids) {
  localStorage.setItem("watchedCoins", JSON.stringify(ids));
}

// Initial fetch + every minute
loadSortState(); // Load sort state before first fetch
fetchData();
setInterval(fetchData, 20 * 1000);