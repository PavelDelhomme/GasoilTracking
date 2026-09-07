/**
 * Helpers PDFKit « safe » pour Gasoil Tracking.
 * Règle d’or : TOUT texte est écrit avec x = LEFT() et width = WIDTH().
 * Jamais de doc.text(...) sans coordonnée après un kvList/table (sinon débordement).
 */
'use strict';

function bindPdfHelpers(doc) {
  const ACCENT = '#c73a52';
  const DARK = '#1a1a2e';
  const MUTED = '#475569';
  const LIGHT = '#f1f5f9';

  const LEFT = () => doc.page.margins.left;
  const RIGHT = () => doc.page.width - doc.page.margins.right;
  const MAX_Y = () => doc.page.height - doc.page.margins.bottom - 10;
  const WIDTH = () => RIGHT() - LEFT();

  function clean(s) {
    let out = String(s ?? '')
      .replace(/\u2192/g, '->')
      .replace(/\u2014/g, '-')
      .replace(/\u2013/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00ab/g, '"')
      .replace(/\u00bb/g, '"');
    // Soft-break uniquement sur séparateurs naturels (pas au milieu des mots / emails)
    out = out.replace(/\//g, '/ ');
    out = out.replace(/([,_])/g, '$1 ');
    return out.replace(/  +/g, ' ');
  }

  function resetX() {
    doc.x = LEFT();
  }

  function need(h) {
    if (doc.y + h > MAX_Y()) {
      doc.addPage();
      resetX();
    }
  }

  function h2(title) {
    need(36);
    doc.moveDown(0.3);
    resetX();
    doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor(ACCENT)
      .text(clean(title), LEFT(), doc.y, { width: WIDTH(), lineGap: 1 });
    const y = doc.y + 1;
    doc.moveTo(LEFT(), y).lineTo(RIGHT(), y).lineWidth(1.1).strokeColor(ACCENT).stroke();
    doc.moveDown(0.28);
    doc.fillColor(DARK);
    resetX();
  }

  function h3(title) {
    need(22);
    doc.moveDown(0.12);
    resetX();
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(DARK)
      .text(clean(title), LEFT(), doc.y, { width: WIDTH() });
    doc.moveDown(0.08);
    resetX();
  }

  function para(t) {
    const text = clean(t);
    doc.font('Helvetica').fontSize(9).fillColor(DARK);
    const h = doc.heightOfString(text, { width: WIDTH(), lineGap: 1.1 });
    need(h + 6);
    resetX();
    doc.text(text, LEFT(), doc.y, { width: WIDTH(), align: 'left', lineGap: 1.1 });
    doc.moveDown(0.16);
    resetX();
  }

  function note(t) {
    const text = clean(t);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED);
    const h = doc.heightOfString(text, { width: WIDTH() });
    need(h + 4);
    resetX();
    doc.text(text, LEFT(), doc.y, { width: WIDTH() });
    doc.moveDown(0.12);
    doc.fillColor(DARK);
    resetX();
  }

  function bullets(items, size = 8.8) {
    for (const item of items) {
      const text = clean('•  ' + item);
      doc.font('Helvetica').fontSize(size).fillColor(DARK);
      const h = doc.heightOfString(text, { width: WIDTH() - 2, lineGap: 0.6 });
      need(h + 2);
      resetX();
      doc.text(text, LEFT(), doc.y, { width: WIDTH() - 2, lineGap: 0.6 });
    }
    doc.moveDown(0.12);
    resetX();
  }

  function callout(title, body, color = ACCENT) {
    const pad = 8;
    const innerW = WIDTH() - pad * 2 - 4;
    const t = clean(title);
    const b = clean(body);
    doc.font('Helvetica-Bold').fontSize(9);
    const th = doc.heightOfString(t, { width: innerW });
    doc.font('Helvetica').fontSize(8.3);
    const bh = doc.heightOfString(b, { width: innerW, lineGap: 1 });
    const boxH = th + bh + pad * 2 + 4;
    need(boxH + 4);
    const y0 = doc.y;
    const x0 = LEFT();
    doc.save();
    doc.roundedRect(x0, y0, WIDTH(), boxH, 4).fill(LIGHT);
    doc.rect(x0, y0, 3.5, boxH).fill(color);
    doc.restore();
    doc
      .fillColor(DARK)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(t, x0 + pad + 4, y0 + pad, { width: innerW });
    doc
      .font('Helvetica')
      .fontSize(8.3)
      .text(b, x0 + pad + 4, doc.y + 2, { width: innerW, lineGap: 1 });
    doc.y = y0 + boxH + 6;
    resetX();
  }

  function table(headers, rows, colWeights) {
    const weights = colWeights || headers.map(() => 1);
    const sum = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (WIDTH() * w) / sum);
    const x0 = LEFT();
    const fs = 7.2;
    const cellPadX = 3;
    const cellPadY = 3;
    const headerH = 13;

    const measureRow = (cells) => {
      doc.font('Helvetica').fontSize(fs);
      let h = 11;
      cells.forEach((cell, i) => {
        const cw = Math.max(12, widths[i] - cellPadX * 2);
        const ch = doc.heightOfString(clean(cell), { width: cw, lineGap: 0.4 });
        h = Math.max(h, ch + cellPadY * 2);
      });
      return Math.min(Math.max(h, 12), 90);
    };

    const drawHeader = () => {
      need(headerH + 2);
      const y = doc.y;
      doc.save();
      doc.rect(x0, y, WIDTH(), headerH).fill(DARK);
      doc.restore();
      let x = x0;
      headers.forEach((h, i) => {
        const cw = Math.max(12, widths[i] - cellPadX * 2);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(fs);
        doc.text(clean(h), x + cellPadX, y + 3, {
          width: cw,
          height: headerH - 4,
          lineBreak: true,
          ellipsis: true,
        });
        x += widths[i];
      });
      doc.y = y + headerH;
      resetX();
    };

    drawHeader();
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri].map(clean);
      const rowH = measureRow(row);
      if (doc.y + rowH > MAX_Y()) {
        doc.addPage();
        resetX();
        drawHeader();
      }
      const y = doc.y;
      if (ri % 2 === 0) {
        doc.save();
        doc.rect(x0, y, WIDTH(), rowH).fill('#f8fafc');
        doc.restore();
      }
      let x = x0;
      row.forEach((cell, i) => {
        const cw = Math.max(12, widths[i] - cellPadX * 2);
        doc.fillColor(DARK).font('Helvetica').fontSize(fs);
        doc.text(cell, x + cellPadX, y + cellPadY, {
          width: cw,
          height: rowH - cellPadY + 1,
          lineGap: 0.4,
        });
        x += widths[i];
      });
      doc.y = y + rowH;
      resetX();
    }
    doc.moveDown(0.18);
    resetX();
  }

  function kvList(pairs) {
    const labelW = 118;
    const valueW = WIDTH() - labelW - 6;
    for (const [k, v] of pairs) {
      const kk = clean(k);
      const vv = clean(v);
      doc.font('Helvetica').fontSize(8.2);
      const vh = doc.heightOfString(vv, { width: valueW, lineGap: 0.5 });
      const kh = doc.heightOfString(kk, { width: labelW });
      const rowH = Math.max(vh, kh, 11);
      need(rowH + 3);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(MUTED).text(kk, LEFT(), y, {
        width: labelW,
      });
      doc.font('Helvetica').fontSize(8.2).fillColor(DARK).text(vv, LEFT() + labelW + 6, y, {
        width: valueW,
        lineGap: 0.5,
      });
      doc.y = y + rowH + 2;
      resetX();
    }
    doc.moveDown(0.12);
    resetX();
  }

  function writeFooters(label) {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(MUTED)
        .text(`${label} — ${i + 1}/${range.count}`, LEFT(), doc.page.height - 28, {
          width: WIDTH(),
          align: 'center',
          lineBreak: false,
          height: 12,
        });
      doc.page.margins.bottom = bottom;
    }
    return range.count;
  }

  return {
    ACCENT,
    DARK,
    MUTED,
    LIGHT,
    LEFT,
    RIGHT,
    WIDTH,
    MAX_Y,
    clean,
    resetX,
    need,
    h2,
    h3,
    para,
    note,
    bullets,
    callout,
    table,
    kvList,
    writeFooters,
  };
}

module.exports = { bindPdfHelpers };
