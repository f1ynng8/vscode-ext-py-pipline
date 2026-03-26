// @ts-nocheck
/* Pipeline canvas renderer — top-to-bottom asset-centric DAG */
(function () {
  var vscode = acquireVsCodeApi();
  var assets = pipelineData.assets;
  var scripts = pipelineData.scripts;
  var name = pipelineData.name;
  var description = pipelineData.description;

  var ROW_GAP = 36, COL_GAP = 40, ASSET_W = 340, SCRIPT_W = 300, PAD_X = 40, PAD_Y = 60;

  var container = document.getElementById('nodes-container');
  var svg = document.getElementById('connections');
  var titleEl = document.getElementById('pipeline-title');
  if (name) { titleEl.textContent = name + (description ? ' — ' + description : ''); }

  // Lookups
  var assetMap = {}, scriptByOutput = {}, scriptMap = {};
  assets.forEach(function(a) { assetMap[a.id] = a; });
  scripts.forEach(function(s) { scriptByOutput[s.outputId] = s; scriptMap[s.id] = s; });

  // Row assignment
  var nodeRows = {};
  assets.forEach(function(a) { nodeRows[a.id] = a.depth * 2; });
  scripts.forEach(function(s) {
    var out = assetMap[s.outputId];
    if (out) { nodeRows[s.id] = out.depth * 2 - 1; }
  });

  // Group by row
  var rows = {};
  assets.forEach(function(a) {
    var r = nodeRows[a.id]; if (!rows[r]) rows[r] = [];
    rows[r].push({ id: a.id, nodeType: 'asset', data: a });
  });
  scripts.forEach(function(s) {
    var r = nodeRows[s.id]; if (r === undefined) return; if (!rows[r]) rows[r] = [];
    rows[r].push({ id: s.id, nodeType: 'script', data: s });
  });
  var sortedRowKeys = Object.keys(rows).map(Number).sort(function(a, b) { return a - b; });

  // ── Create DOM ──
  var elements = {};

  assets.forEach(function(a) {
    var el = document.createElement('div');
    el.className = 'asset-node' + (a.type === 'source_data' ? ' source' : '');
    el.style.width = ASSET_W + 'px';
    el.setAttribute('data-nid', a.id);
    el.setAttribute('data-ntype', 'asset');
    el.innerHTML =
      '<div class="asset-label">' + esc(a.id) + '</div>' +
      (a.desc ? '<div class="asset-desc">' + esc(a.desc) + '</div>' : '') +
      '<div class="asset-path" data-file="' + esc(a.path) + '">' + esc(a.path) + '</div>';
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    container.appendChild(el);
    elements[a.id] = el;
  });

  scripts.forEach(function(s) {
    var el = document.createElement('div');
    el.className = 'script-node';
    el.style.width = SCRIPT_W + 'px';
    el.setAttribute('data-nid', s.id);
    el.setAttribute('data-ntype', 'script');
    el.innerHTML =
      '<span class="script-label" data-file="' + esc(s.script) + '" title="' + esc(s.script) + '">' + esc(shortName(s.script)) + '</span>' +
      '<button class="script-run-btn" data-run="' + esc(s.script) + '">&#9654;</button>';
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    container.appendChild(el);
    elements[s.id] = el;
  });

  var edgeElements = [];

  // ── Layout ──
  requestAnimationFrame(function() {
    var nodeSize = {};
    Object.keys(elements).forEach(function(id) {
      nodeSize[id] = { w: elements[id].offsetWidth, h: elements[id].offsetHeight };
    });

    var rowHeight = {};
    sortedRowKeys.forEach(function(r) {
      var hh = 40;
      (rows[r] || []).forEach(function(n) { var h = nodeSize[n.id] ? nodeSize[n.id].h : 40; if (h > hh) hh = h; });
      rowHeight[r] = hh;
    });

    var rowY = {}, yc = PAD_Y;
    sortedRowKeys.forEach(function(r) { rowY[r] = yc; yc += rowHeight[r] + ROW_GAP; });

    var positions = {};

    function getParentIds(nid, ntype) {
      if (ntype === 'script') { var s = scriptMap[nid]; return s ? s.inputIds : []; }
      var gen = scriptByOutput[nid]; return gen ? [gen.id] : [];
    }

    // Row 0
    var row0 = rows[0] || [];
    var xc0 = PAD_X;
    row0.forEach(function(n) {
      var w = nodeSize[n.id] ? nodeSize[n.id].w : ASSET_W;
      var h = nodeSize[n.id] ? nodeSize[n.id].h : 40;
      positions[n.id] = { x: xc0, y: rowY[0] + (rowHeight[0] - h) / 2, w: w, h: h };
      xc0 += w + COL_GAP;
    });

    // Subsequent rows
    for (var ri = 1; ri < sortedRowKeys.length; ri++) {
      var r = sortedRowKeys[ri];
      var group = rows[r] || [];
      if (!group.length) continue;

      // Group siblings by shared parent
      var sgMap = {};
      group.forEach(function(n) {
        var pids = getParentIds(n.id, n.nodeType);
        var key = pids.slice().sort().join(',') || '__none__';
        if (!sgMap[key]) sgMap[key] = { parentIds: pids, nodes: [] };
        sgMap[key].nodes.push(n);
      });

      var placements = [];
      Object.keys(sgMap).forEach(function(key) {
        var sg = sgMap[key], nodes = sg.nodes;
        var pCenters = [];
        sg.parentIds.forEach(function(pid) {
          var p = positions[pid];
          if (p) pCenters.push(p.x + p.w / 2);
        });
        var gc = pCenters.length ? (Math.min.apply(null, pCenters) + Math.max.apply(null, pCenters)) / 2 : PAD_X + 200;
        var tw = 0;
        nodes.forEach(function(n) { tw += (nodeSize[n.id] ? nodeSize[n.id].w : ASSET_W); });
        tw += (nodes.length - 1) * COL_GAP;
        var sx = gc - tw / 2;
        nodes.forEach(function(n) {
          var w = nodeSize[n.id] ? nodeSize[n.id].w : ASSET_W;
          placements.push({ node: n, x: sx }); sx += w + COL_GAP;
        });
      });

      placements.sort(function(a, b) { return a.x - b.x; });
      for (var i = 1; i < placements.length; i++) {
        var pw = nodeSize[placements[i-1].node.id] ? nodeSize[placements[i-1].node.id].w : ASSET_W;
        var mn = placements[i-1].x + pw + COL_GAP;
        if (placements[i].x < mn) placements[i].x = mn;
      }

      placements.forEach(function(pl) {
        var n = pl.node;
        var w = nodeSize[n.id] ? nodeSize[n.id].w : ASSET_W;
        var h = nodeSize[n.id] ? nodeSize[n.id].h : 40;
        positions[n.id] = { x: pl.x, y: rowY[r] + (rowHeight[r] - h) / 2, w: w, h: h };
      });
    }

    // Clamp
    var mnX = Infinity;
    Object.keys(positions).forEach(function(id) { if (positions[id].x < mnX) mnX = positions[id].x; });
    if (mnX < PAD_X) {
      var sh = PAD_X - mnX;
      Object.keys(positions).forEach(function(id) { positions[id].x += sh; });
    }

    // Apply
    Object.keys(elements).forEach(function(id) {
      var p = positions[id]; if (!p) return;
      elements[id].style.left = p.x + 'px';
      elements[id].style.top = p.y + 'px';
      elements[id].style.visibility = 'visible';
    });

    // Canvas size
    var maxX = 0, maxY = 0;
    Object.keys(positions).forEach(function(id) {
      var p = positions[id];
      if (p.x + p.w > maxX) maxX = p.x + p.w;
      if (p.y + p.h > maxY) maxY = p.y + p.h;
    });
    var cW = maxX + PAD_X, cH = maxY + PAD_Y;
    container.style.width = cW + 'px'; container.style.height = cH + 'px';
    svg.setAttribute('width', cW); svg.setAttribute('height', cH);
    svg.style.width = cW + 'px'; svg.style.height = cH + 'px';

    // Draw edges
    scripts.forEach(function(s) {
      var sp = positions[s.id]; if (!sp) return;
      var scx = sp.x + sp.w / 2;
      s.inputIds.forEach(function(iid) {
        var ip = positions[iid]; if (!ip) return;
        var els = drawArrow(ip.x + ip.w / 2, ip.y + ip.h, scx, sp.y);
        edgeElements.push({ from: iid, to: s.id, path: els[0], arrow: els[1] });
      });
      var op = positions[s.outputId];
      if (op) {
        var els = drawArrow(scx, sp.y + sp.h, op.x + op.w / 2, op.y);
        edgeElements.push({ from: s.id, to: s.outputId, path: els[0], arrow: els[1] });
      }
    });

    // ══════════════════════════════════════════
    // HIGHLIGHT — single global click delegation
    // ══════════════════════════════════════════
    document.addEventListener('click', function(ev) {
      // Check if clicked a run button
      var runBtn = ev.target.closest('[data-run]');
      if (runBtn) {
        ev.preventDefault();
        vscode.postMessage({ type: 'runScript', script: runBtn.getAttribute('data-run') });
        return;
      }

      // Check if clicked a file path
      var fileEl = ev.target.closest('[data-file]');
      if (fileEl) {
        ev.preventDefault();
        vscode.postMessage({ type: 'openFile', file: fileEl.getAttribute('data-file') });
        return;
      }

      // Check if clicked on a node
      var nodeEl = ev.target.closest('[data-nid]');
      clearAll();

      if (!nodeEl) return;

      var nid = nodeEl.getAttribute('data-nid');
      var ntype = nodeEl.getAttribute('data-ntype');
      var hlNodes = [nid];
      var hlEdges = []; // [fromId, toId]

      if (ntype === 'asset') {
        // Recursive upstream: trace back to all source assets
        var visited = {};
        function traceUpstream(assetId) {
          if (visited[assetId]) return;
          visited[assetId] = true;
          var gen = scriptByOutput[assetId];
          if (!gen) return; // source asset, stop
          hlNodes.push(gen.id);
          hlEdges.push([gen.id, assetId]);
          gen.inputIds.forEach(function(iid) {
            hlNodes.push(iid);
            hlEdges.push([iid, gen.id]);
            traceUpstream(iid);
          });
        }
        traceUpstream(nid);
      } else if (ntype === 'script') {
        var sc = scriptMap[nid];
        if (sc) {
          sc.inputIds.forEach(function(iid) {
            hlNodes.push(iid);
            hlEdges.push([iid, nid]);
          });
          hlNodes.push(sc.outputId);
          hlEdges.push([nid, sc.outputId]);
        }
      }

      // Apply highlight
      hlNodes.forEach(function(id) {
        if (elements[id]) elements[id].classList.add('hl');
      });
      hlEdges.forEach(function(pair) {
        edgeElements.forEach(function(e) {
          if (e.from === pair[0] && e.to === pair[1]) {
            e.path.classList.add('hl');
            e.arrow.classList.add('hl');
          }
        });
      });
    });

    function clearAll() {
      Object.keys(elements).forEach(function(id) { elements[id].classList.remove('hl'); });
      edgeElements.forEach(function(e) { e.path.classList.remove('hl'); e.arrow.classList.remove('hl'); });
    }
  });

  function drawArrow(x1, y1, x2, y2) {
    var cp = Math.max(Math.abs(y2 - y1) * 0.4, 20);
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + cp) + ', ' + x2 + ' ' + (y2 - cp) + ', ' + x2 + ' ' + y2);
    p.setAttribute('class', 'dep-line');
    svg.appendChild(p);
    var sz = 7;
    var a = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    a.setAttribute('points', x2 + ',' + y2 + ' ' + (x2 - sz/2) + ',' + (y2 - sz) + ' ' + (x2 + sz/2) + ',' + (y2 - sz));
    a.setAttribute('class', 'dep-arrow');
    svg.appendChild(a);
    return [p, a];
  }

  function shortName(fp) { return fp ? fp.replace(/\\/g, '/').split('/').pop() : ''; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  document.getElementById('refreshBtn').addEventListener('click', function() {
    vscode.postMessage({ type: 'refresh' });
  });
})();
