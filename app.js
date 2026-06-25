(function () {
  const FIELDS = [
    { key: "r", label: "Thermal Resistance", unit: "K/W", input: "thermalResistance" },
    { key: "q", label: "Heat Input", unit: "W", input: "heatInput" }
  ];

  const INFERRED = [
    { key: "angle", label: "Inclination Angle", unit: "deg" },
    { key: "fr", label: "Filling Ratio", unit: "%" },
    { key: "n", label: "Number of Turns", unit: "" }
  ];

  const TARGETS = [
    { key: "di", label: "Di", name: "Inner Diameter", unit: "mm" },
    { key: "do", label: "Do", name: "Outer Diameter", unit: "mm" },
    { key: "le", label: "Le", name: "Evaporator Length", unit: "mm" },
    { key: "lc", label: "Lc", name: "Condenser Length", unit: "mm" }
  ];

  const DATA = window.HP_DATA || [];
  const stats = buildStats(DATA);
  const form = document.getElementById("predictForm");
  let batchResults = [];

  document.getElementById("datasetStatus").textContent = `${DATA.length.toLocaleString()} datapoints from Final_combined_datapoints.xlsx`;
  document.getElementById("singleTab").addEventListener("click", () => setMode("single"));
  document.getElementById("batchTab").addEventListener("click", () => setMode("batch"));
  document.getElementById("singleModeRadio").addEventListener("change", () => setMode("single"));
  document.getElementById("batchModeRadio").addEventListener("change", () => setMode("batch"));
  document.getElementById("csvUpload").addEventListener("change", handleBatchUpload);
  document.getElementById("downloadBatchBtn").addEventListener("click", downloadBatchResults);
  document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("thermalResistance").value = "0";
    document.getElementById("heatInput").value = "0";
    document.getElementById("neighbors").value = "0";
    predict();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    predict();
  });

  function buildStats(rows) {
    const result = {};
    [...FIELDS, ...INFERRED, ...TARGETS].forEach((field) => {
      const values = rows.map((row) => row[field.key]).filter(Number.isFinite);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length - 1, 1);
      result[field.key] = { min, max, mean, sd: Math.sqrt(variance) || 1 };
    });
    return result;
  }

  function readInputs() {
    const sample = {};
    FIELDS.forEach((field) => {
      sample[field.key] = Number(document.getElementById(field.input).value);
    });
    return sample;
  }

  function setMode(mode) {
    const isBatch = mode === "batch";
    document.getElementById("predictForm").classList.toggle("hidden", isBatch);
    document.getElementById("batchPanel").classList.toggle("hidden", !isBatch);
    document.getElementById("singleTab").classList.toggle("active", !isBatch);
    document.getElementById("batchTab").classList.toggle("active", isBatch);
    document.getElementById("singleModeRadio").checked = !isBatch;
    document.getElementById("batchModeRadio").checked = isBatch;
  }

  function distance(row, sample) {
    return Math.sqrt(FIELDS.reduce((sum, field) => {
      const zRow = (row[field.key] - stats[field.key].mean) / stats[field.key].sd;
      const zSample = (sample[field.key] - stats[field.key].mean) / stats[field.key].sd;
      return sum + (zRow - zSample) ** 2;
    }, 0));
  }

  function weightedQuantile(items, targetKey, quantile) {
    const sorted = [...items].sort((a, b) => a.row[targetKey] - b.row[targetKey]);
    const total = sorted.reduce((sum, item) => sum + item.weight, 0);
    let cumulative = 0;
    for (const item of sorted) {
      cumulative += item.weight;
      if (cumulative / total >= quantile) return item.row[targetKey];
    }
    return sorted[sorted.length - 1].row[targetKey];
  }

  function getNeighborCount() {
    return Math.max(3, Math.min(50, Number(document.getElementById("neighbors").value) || 12));
  }

  function computePrediction(sample, neighborCount = getNeighborCount()) {
    if (!DATA.length) return;
    const k = Math.max(3, Math.min(50, Number(neighborCount) || 12));
    const ranked = DATA
      .map((row) => ({ row, d: distance(row, sample) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((item) => ({ ...item, weight: 1 / Math.max(item.d, 0.000001) ** 2 }));

    const weightTotal = ranked.reduce((sum, item) => sum + item.weight, 0);
    const predictions = TARGETS.map((target) => {
      const mean = ranked.reduce((sum, item) => sum + item.row[target.key] * item.weight, 0) / weightTotal;
      const lo = weightedQuantile(ranked, target.key, 0.1);
      const hi = weightedQuantile(ranked, target.key, 0.9);
      return { ...target, mean, lo, hi };
    });
    const inferred = INFERRED.map((target) => {
      const mean = ranked.reduce((sum, item) => sum + item.row[target.key] * item.weight, 0) / weightTotal;
      const lo = weightedQuantile(ranked, target.key, 0.1);
      const hi = weightedQuantile(ranked, target.key, 0.9);
      return { ...target, mean, lo, hi };
    });
    return { predictions, inferred, ranked };
  }

  function predict() {
    if (!DATA.length) return;
    const sample = readInputs();
    const result = computePrediction(sample);

    renderPredictions(result.predictions);
    renderInferred(result.inferred);
    renderMatches(result.ranked.slice(0, 10));
    renderStats(sample, result.ranked);
  }

  function fmt(value, digits = 2) {
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function renderPredictions(predictions) {
    const container = document.getElementById("dimensionCards");
    container.innerHTML = predictions.map((pred) => `
      <div class="dim-card">
        <span>${pred.name}</span>
        <strong>${fmt(pred.mean)} ${pred.unit}</strong>
        <small>${pred.label}: ${fmt(pred.lo)}-${fmt(pred.hi)} ${pred.unit} nearby range</small>
      </div>
    `).join("");
  }

  function renderInferred(inferred) {
    const container = document.getElementById("inferredCards");
    container.innerHTML = inferred.map((pred) => `
      <div class="inferred-card">
        <span>${pred.label}</span>
        <strong>${fmt(pred.mean, pred.key === "n" ? 0 : 2)} ${pred.unit}</strong>
        <small>${fmt(pred.lo, pred.key === "n" ? 0 : 2)}-${fmt(pred.hi, pred.key === "n" ? 0 : 2)} ${pred.unit} nearby range</small>
      </div>
    `).join("");
  }

  function renderMatches(matches) {
    const body = document.getElementById("matchesBody");
    body.innerHTML = matches.map((item, index) => {
      const row = item.row;
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${fmt(row.r, 4)}</td>
          <td>${fmt(row.q)}</td>
          <td>${fmt(row.angle)}</td>
          <td>${fmt(row.fr, 0)}</td>
          <td>${fmt(row.n, 0)}</td>
          <td>${fmt(row.di)}</td>
          <td>${fmt(row.do)}</td>
          <td>${fmt(row.le)}</td>
          <td>${fmt(row.lc)}</td>
          <td title="${row.ref || "Not listed"}">${row.ref || "Not listed"}</td>
        </tr>
      `;
    }).join("");
  }

  function renderStats(sample, matches) {
    const minDistance = matches[0] ? matches[0].d : 0;
    const outside = FIELDS.filter((field) => sample[field.key] < stats[field.key].min || sample[field.key] > stats[field.key].max);
    const badge = document.getElementById("confidenceBadge");
    badge.textContent = outside.length ? "Outside dataset range" : minDistance < 0.35 ? "High similarity" : "Moderate similarity";
    badge.style.color = outside.length ? "var(--warn)" : "var(--good)";

    document.getElementById("rangeWarning").textContent = outside.length
      ? `Caution: ${outside.map((field) => field.label).join(", ")} is outside the experimental range, so treat the estimate as extrapolation.`
      : "";

    const statsEl = document.getElementById("modelStats");
    statsEl.innerHTML = `
      <dt>Rows used</dt><dd>${DATA.length.toLocaleString()}</dd>
      <dt>Nearest neighbors</dt><dd>${matches.length}</dd>
      <dt>Closest distance</dt><dd>${fmt(minDistance, 3)}</dd>
      <dt>Thermal R range</dt><dd>${fmt(stats.r.min, 3)}-${fmt(stats.r.max, 3)} K/W</dd>
      <dt>Heat input range</dt><dd>${fmt(stats.q.min, 1)}-${fmt(stats.q.max, 1)} W</dd>
    `;
  }

  function normalizeHeader(header) {
    return String(header || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9]/g, "");
  }

  function splitCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("CSV must include a header row and at least one data row.");

    const headers = splitCsvLine(lines[0]);
    const normalized = headers.map(normalizeHeader);
    const rAliases = ["thermalresistancekw", "thermalresistance", "rkw", "r"];
    const qAliases = ["qw", "q", "heatinputqw", "heatinputw", "heatinput"];
    const rIndex = normalized.findIndex((header) => rAliases.includes(header));
    const qIndex = normalized.findIndex((header) => qAliases.includes(header));

    if (rIndex === -1 || qIndex === -1) {
      throw new Error('CSV needs columns "Thermal Resistance (K/W)" and "Q(W)".');
    }

    return lines.slice(1).map((line, index) => {
      const cells = splitCsvLine(line);
      const r = Number(cells[rIndex]);
      const q = Number(cells[qIndex]);
      return {
        rowNumber: index + 2,
        r,
        q,
        isValid: Number.isFinite(r) && Number.isFinite(q) && r > 0 && q > 0
      };
    });
  }

  function asOutputRow(input, result) {
    const byKey = {};
    [...result.inferred, ...result.predictions].forEach((item) => {
      byKey[item.key] = item.mean;
    });
    return {
      inputRow: input.rowNumber,
      r: input.r,
      q: input.q,
      angle: byKey.angle,
      fr: byKey.fr,
      n: byKey.n,
      di: byKey.di,
      do: byKey.do,
      le: byKey.le,
      lc: byKey.lc,
      closestDistance: result.ranked[0] ? result.ranked[0].d : null,
      status: "OK"
    };
  }

  function renderBatchResults(rows) {
    const body = document.getElementById("batchBody");
    body.innerHTML = rows.slice(0, 100).map((row) => `
      <tr>
        <td>${row.inputRow}</td>
        <td>${Number.isFinite(row.r) ? fmt(row.r, 4) : "-"}</td>
        <td>${Number.isFinite(row.q) ? fmt(row.q, 2) : "-"}</td>
        <td>${Number.isFinite(row.angle) ? fmt(row.angle, 2) : "-"}</td>
        <td>${Number.isFinite(row.fr) ? fmt(row.fr, 2) : "-"}</td>
        <td>${Number.isFinite(row.n) ? fmt(row.n, 0) : "-"}</td>
        <td>${Number.isFinite(row.di) ? fmt(row.di, 2) : "-"}</td>
        <td>${Number.isFinite(row.do) ? fmt(row.do, 2) : "-"}</td>
        <td>${Number.isFinite(row.le) ? fmt(row.le, 2) : "-"}</td>
        <td>${Number.isFinite(row.lc) ? fmt(row.lc, 2) : "-"}</td>
        <td>${row.status}</td>
      </tr>
    `).join("");
  }

  function handleBatchUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const inputs = parseCsv(String(reader.result || ""));
        const k = getNeighborCount();
        batchResults = inputs.map((input) => {
          if (!input.isValid) {
            return { ...input, angle: null, fr: null, n: null, di: null, do: null, le: null, lc: null, closestDistance: null, status: "Invalid input" };
          }
          return asOutputRow(input, computePrediction({ r: input.r, q: input.q }, k));
        });
        const validCount = batchResults.filter((row) => row.status === "OK").length;
        renderBatchResults(batchResults);
        document.getElementById("downloadBatchBtn").disabled = validCount === 0;
        document.getElementById("batchStatus").textContent = `${validCount} of ${batchResults.length} rows predicted. Showing first ${Math.min(100, batchResults.length)} rows.`;
      } catch (error) {
        batchResults = [];
        renderBatchResults([]);
        document.getElementById("downloadBatchBtn").disabled = true;
        document.getElementById("batchStatus").textContent = error.message;
      }
    };
    reader.readAsText(file);
  }

  function csvEscape(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "";
    const text = typeof value === "number" ? String(Number(value.toFixed(6))) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadBatchResults() {
    if (!batchResults.length) return;
    const headers = [
      "Input Row",
      "Thermal Resistance (K/W)",
      "Q(W)",
      "Predicted Inclination Angle (deg)",
      "Predicted Filling Ratio (%)",
      "Predicted N",
      "Predicted Di(mm)",
      "Predicted Do(mm)",
      "Predicted Le(mm)",
      "Predicted Lc(mm)",
      "Closest Distance",
      "Status"
    ];
    const rows = batchResults.map((row) => [
      row.inputRow,
      row.r,
      row.q,
      row.angle,
      row.fr,
      row.n,
      row.di,
      row.do,
      row.le,
      row.lc,
      row.closestDistance,
      row.status
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "heat_pipe_batch_predictions.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  predict();
})();
