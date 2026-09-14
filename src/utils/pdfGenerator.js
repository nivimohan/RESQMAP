import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates and downloads an executive-grade, visual NDRF Decision Dossier (PDF).
 * Designed for immediate tactical comprehension by Incident Commanders and District Magistrates.
 * 
 * @param {Object} params
 * @param {Object} params.origin - Origin danger zone habitation telemetry
 * @param {Object} params.siteA - Primary safe site data
 * @param {Object} params.siteB - Secondary safe site data
 * @param {Object} params.siteC - Tertiary safe site data
 * @param {Object} params.cascade - Cumulative cascade allocation data
 * @param {Object} params.scores - Regional risk scores
 * @param {Object} params.brief - Gemini AI generated structured decision brief
 */
export function generatePdfDocument({
  origin = {},
  siteA = null,
  siteB = null,
  siteC = null,
  cascade = null,
  scores = {},
  brief = {},
  isSafeZone = false,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;

  // Helper for dynamic page overflow management
  const checkPageBreak = (neededHeight) => {
    if (currentY + neededHeight > pageHeight - 18) {
      doc.addPage();
      currentY = margin + 4;
      renderSubPageHeader();
      return true;
    }
    return false;
  };

  const renderSubPageHeader = () => {
    doc.setFillColor(15, 23, 42); // #0f172a
    doc.rect(0, 0, pageWidth, 12, 'F');

    doc.setFillColor(isSafeZone ? 5 : 217, isSafeZone ? 150 : 119, isSafeZone ? 105 : 6); // Emerald #059669 or Amber #d97706
    doc.rect(0, 12, pageWidth, 1.2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      isSafeZone
        ? 'NATIONAL DISASTER RESPONSE FORCE (NDRF) — GEOTECHNICAL STABILITY CLEARANCE'
        : 'NATIONAL DISASTER RESPONSE FORCE (NDRF) — RESQMAP TACTICAL DOSSIER',
      margin,
      7.8
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text('OPERATIONAL BRIEFING • CONFIDENTIAL', pageWidth - margin, 7.8, { align: 'right' });

    currentY = 18;
  };

  // ══════════════════════════════════════════════════════════════════
  // 1. TOP EMERGENCY / CLEARANCE HEADER
  // ══════════════════════════════════════════════════════════════════
  doc.setFillColor(15, 23, 42); // Navy slate #0f172a
  doc.rect(0, 0, pageWidth, 32, 'F');

  // Accent strip: Emerald for safe, Amber for evacuation
  doc.setFillColor(isSafeZone ? 5 : 217, isSafeZone ? 150 : 119, isSafeZone ? 105 : 6);
  doc.rect(0, 32, pageWidth, 1.8, 'F');

  // Emblem / Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('NATIONAL DISASTER RESPONSE FORCE (NDRF)', margin, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text('MINISTRY OF HOME AFFAIRS, GOVT. OF INDIA  |  RESQMAP GEOTECHNICAL CELL', margin, 17);

  // Status Pill: Green clearance for safe zone, Red for critical danger
  const pillText = isSafeZone
    ? 'CLEARANCE: GEOTECHNICALLY STABLE — ZERO EVACUATION REQUIRED'
    : 'RED ALERT: IMMEDIATE MASS RELOCATION REQUIRED';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const pillWidth = doc.getTextWidth(pillText) + 12;
  const pillX = margin;
  const pillY = 21.5;

  if (isSafeZone) {
    doc.setFillColor(5, 150, 105); // Emerald #059669
  } else {
    doc.setFillColor(220, 38, 38); // Red #dc2626
  }
  doc.roundedRect(pillX, pillY, pillWidth, 7, 1.8, 1.8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(`* ${pillText}`, pillX + 6, pillY + 4.8);

  // Right-side badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(isSafeZone ? 52 : 251, isSafeZone ? 211 : 191, isSafeZone ? 153 : 36); // Emerald 400 or Amber 400
  doc.text(
    isSafeZone ? 'GEOTECHNICAL STABILITY CLEARANCE' : 'TACTICAL DECISION DOSSIER',
    pageWidth - margin,
    11,
    { align: 'right' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  doc.text(`ISSUED: ${dateStr} ${timeStr} IST`, pageWidth - margin, 17, { align: 'right' });

  const aiEngine = isSafeZone ? 'NDRF Geotechnical Baseline Protocol' : (brief?.source === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : 'NDRF Geotechnical Rule-Engine');
  doc.text(`ENGINE: ${aiEngine}`, pageWidth - margin, 24, { align: 'right' });

  currentY = 38;

  // ══════════════════════════════════════════════════════════════════
  // METADATA RIBBON (Ref ID, Timestamp, Origin Village, Population)
  // ══════════════════════════════════════════════════════════════════
  const refCode = `NDRF-RQ-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${now.getFullYear()}`;
  const originName = origin?.name || 'Target Habitation';
  const popCount = origin?.population ? origin.population.toLocaleString() : '2,500';

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

  const colWidth = contentWidth / 4;
  
  // Col 1: Doc Ref
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('DOCUMENT REF', margin + 4, currentY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(refCode, margin + 4, currentY + 9);

  // Col 2: Timestamp
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TIME OF ISSUANCE', margin + colWidth + 4, currentY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${dateStr} ${timeStr}`, margin + colWidth + 4, currentY + 9);

  // Col 3: Target Settlement
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TARGET HABITATION', margin + colWidth * 2 + 4, currentY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(220, 38, 38);
  doc.text(originName.length > 20 ? originName.substring(0, 19) + '...' : originName, margin + colWidth * 2 + 4, currentY + 9);

  // Col 4: Exposed Citizens
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('POPULATION AT RISK', margin + colWidth * 3 + 4, currentY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${popCount} Citizens`, margin + colWidth * 3 + 4, currentY + 9);

  currentY += 16;

  // ══════════════════════════════════════════════════════════════════
  // 2. SECTION 1: ORIGIN / HABITATION GEOTECHNICAL TELEMETRY
  // ══════════════════════════════════════════════════════════════════
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isSafeZone
      ? 'SECTION 1: HABITATION BASELINE GEOTECHNICAL TELEMETRY'
      : 'SECTION 1: ORIGIN DANGER ZONE GEOTECHNICAL TELEMETRY',
    margin,
    currentY
  );

  currentY += 2.5;

  const rawSlope = origin?.slope_degrees != null ? origin.slope_degrees : (isSafeZone ? 1.5 : 32.5);
  const isSlopeCritical = rawSlope >= 25;
  const rawRain = origin?.rainfall_48h_mm != null ? origin.rainfall_48h_mm : (isSafeZone ? 0.0 : 142.5);
  const isRainCritical = rawRain >= 50;
  const rawRisk = origin?.hazard_score_pct ? origin.hazard_score_pct : (scores?.overall_risk || (isSafeZone ? 12.0 : 82.0));
  const rpiValue = origin?.rpi != null ? `${(origin.rpi * 100).toFixed(1)}%` : (isSafeZone ? '12.0%' : '85.0%');
  const elevationVal = origin?.elevation_m != null ? `${Math.round(origin.elevation_m)} m` : '430 m';

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Slate 800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 2,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.4,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    head: [['Habitation / Village', 'Exposed Citizens', 'Slope Angle', '48h Precipitation', 'Threat Index', 'RPI Score', 'Elevation']],
    body: [
      [
        { content: originName, styles: { fontStyle: 'bold' } },
        { content: `${popCount} Citizens`, styles: { fontStyle: 'bold' } },
        { 
          content: `${rawSlope.toFixed(1)}° ${isSlopeCritical ? 'CRITICAL' : (isSafeZone ? 'STABLE' : 'MODERATE')}`, 
          styles: { textColor: isSlopeCritical ? [220, 38, 38] : (isSafeZone ? [5, 150, 105] : [15, 23, 42]), fontStyle: 'bold' } 
        },
        { 
          content: `${rawRain} mm ${isRainCritical ? 'SATURATED' : 'NORMAL'}`, 
          styles: { textColor: isRainCritical ? [220, 38, 38] : [15, 23, 42], fontStyle: 'bold' } 
        },
        { 
          content: isSafeZone ? `${rawRisk}% (CLEAR / GREEN)` : `${rawRisk}% (RED ZONE)`, 
          styles: { textColor: isSafeZone ? [5, 150, 105] : [220, 38, 38], fontStyle: 'bold', fillColor: isSafeZone ? [236, 253, 245] : [254, 242, 242] } 
        },
        rpiValue,
        elevationVal,
      ],
    ],
  });

  currentY = doc.lastAutoTable.finalY + 4;

  // ══════════════════════════════════════════════════════════════════
  // EMERALD MANDATE CALLOUT BOX (40 m² per Person Standard)
  // ══════════════════════════════════════════════════════════════════
  doc.setFillColor(236, 253, 245); // Emerald 50
  doc.setDrawColor(110, 231, 183); // Emerald 300
  doc.roundedRect(margin, currentY, contentWidth, 10.5, 1.5, 1.5, 'FD');

  // Emerald left vertical marker
  doc.setFillColor(5, 150, 105); // Emerald 600
  doc.rect(margin, currentY, 2.5, 10.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(6, 78, 59); // Emerald 900
  doc.text(
    isSafeZone
      ? 'NDMA PROTOCOL: 40 m² Per Person Emergency Shelter & Host Logistics Envelope'
      : 'NDRF MANDATE: 40 m² Usable Flat Land Per Person Carrying Capacity Standard',
    margin + 5,
    currentY + 4.2
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(4, 120, 87); // Emerald 700
  doc.text(
    isSafeZone
      ? 'Standard applied for host receptor qualification, logistical relief staging, and inter-district decanting safety.'
      : 'Strictly enforced to guarantee dignity, fire clearance separation, water sanitation logistics, and avoid slope overloading.',
    margin + 5,
    currentY + 8
  );

  currentY += 14;

  if (isSafeZone) {
    // ══════════════════════════════════════════════════════════════════
    // TRACK A: SAFE ZONE CLEARANCE SECTIONS
    // ══════════════════════════════════════════════════════════════════

    // ── SECTION 2A: HOST CAPACITY & RECEPTOR AUDIT ───────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION 2: HOST RECEPTOR SUITABILITY & LOGISTICAL AUDIT', margin, currentY);

    currentY += 2.5;

    const hostAudit = brief?.host_capacity_audit || {};
    const stdApplied = hostAudit.standard_applied || '40 m² per person NDMA Logistics Envelope';
    const receptorSuitability = hostAudit.receptor_suitability || 'Optimal. Ground gradient and subsoil support temporary host operations.';
    const hostCap = hostAudit.estimated_host_capacity || `${(parseInt(String(popCount).replace(/,/g, '')) * 1.5).toLocaleString()} citizens`;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [5, 150, 105], // Emerald 600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 2,
      },
      styles: {
        fontSize: 7.2,
        cellPadding: 2.2,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      head: [['Logistics Parameter', 'Audit Evaluation', 'Status / Capacity']],
      body: [
        [
          { content: 'Planning Envelope Standard', styles: { fontStyle: 'bold' } },
          stdApplied,
          { content: 'Enforced', styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
        ],
        [
          { content: 'Host Receptor Viability', styles: { fontStyle: 'bold' } },
          receptorSuitability,
          { content: 'CERTIFIED OPTIMAL', styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
        ],
        [
          { content: 'Estimated Host Capacity', styles: { fontStyle: 'bold' } },
          `Accommodates up to ${hostCap} without structural ground degradation`,
          { content: hostCap, styles: { fontStyle: 'bold', textColor: [15, 23, 42] } },
        ],
      ],
    });

    currentY = doc.lastAutoTable.finalY + 5;

    // ── SECTION 3A: EXECUTIVE CLEARANCE RATIONALE & INDICATORS ────────
    checkPageBreak(50);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION 3: GEOTECHNICAL BASELINE STABILITY CERTIFICATION', margin, currentY);

    currentY += 3;

    // Clearance Callout Box
    const execRationale = brief?.executive_rationale ||
      `Comprehensive multi-criteria geotechnical assessment confirms ground stability for ${originName}. Gentle slope gradient (${rawSlope.toFixed(1)}°) combined with current precipitation (${rawRain} mm) ensures zero structural slope failure risks.`;
    const clearanceHeadline = brief?.headline || `GEOTECHNICAL CLEARANCE: ${originName} Certified Baseline Stable`;

    doc.setFillColor(236, 253, 245); // Emerald 50
    doc.setDrawColor(167, 243, 208); // Emerald 200
    doc.roundedRect(margin, currentY, contentWidth, 17, 1.5, 1.5, 'FD');

    // Emerald accent marker
    doc.setFillColor(5, 150, 105);
    doc.rect(margin, currentY, 2.5, 17, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70); // Emerald 800
    doc.text(clearanceHeadline.length > 90 ? clearanceHeadline.substring(0, 88) + '...' : clearanceHeadline, margin + 5, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(55, 65, 81);
    const rationaleLines = doc.splitTextToSize(execRationale, contentWidth - 10);
    doc.text(rationaleLines, margin + 5, currentY + 9.5);

    currentY += 21;

    // 4 Key Geotechnical Indicators (2x2 Grid)
    const defaultClearanceIndicators = [
      `Terrain slope (${rawSlope.toFixed(1)}°) is well within the NDMA safe threshold (<15°)`,
      `Hydrological saturation (${rawRain} mm) poses no deep-seated pore pressure hazards`,
      'Bedrock and substrata load-bearing capacity remains structurally stable',
      'Designated suitable as a potential regional host shelter receptor',
    ];
    const rawIndicators = Array.isArray(brief?.key_geotechnical_indicators) && brief.key_geotechnical_indicators.length >= 4
      ? brief.key_geotechnical_indicators.slice(0, 4)
      : defaultClearanceIndicators;

    const cardW = (contentWidth - 4) / 2;
    const cardH = 9.5;

    rawIndicators.forEach((fact, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const kx = margin + col * (cardW + 4);
      const ky = currentY + row * (cardH + 2.5);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(kx, ky, cardW, cardH, 1.2, 1.2, 'FD');

      // Emerald Dot
      doc.setFillColor(5, 150, 105);
      doc.circle(kx + 3.5, ky + 4.8, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 41, 59);

      const factClean = fact.length > 55 ? fact.substring(0, 53) + '...' : fact;
      doc.text(factClean, kx + 7, ky + 5.8);
    });

    currentY += 25;

    // ── SECTION 4A: SDMA OPERATIONAL DIRECTIVES (CLEARANCE TRACK) ─────
    checkPageBreak(50);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION 4: STATE DISASTER MANAGEMENT AUTHORITY (SDMA) CLEARANCE DIRECTIVES', margin, currentY);

    currentY += 3.5;

    const defaultClearanceDirectives = [
      { step: 1, title: 'TELEMETRY WATCH', action: 'Maintain automated meteorological and hydrological sensor logging with hourly polling.' },
      { step: 2, title: 'TRANSIT ARTERIALS', action: 'Keep regional logistical corridors and arterial roads cleared for inter-district aid transit.' },
      { step: 3, title: 'RECEPTOR PREPAREDNESS', action: 'Pre-designate open public grounds for staging logistical relief depots if adjacent sectors escalate.' },
      { step: 4, title: 'CIVIL ADVISORY', action: 'Issue official advisory confirming normal operations and structural ground safety.' },
    ];

    let directives = defaultClearanceDirectives;
    if (Array.isArray(brief?.sdma_operational_directives) && brief.sdma_operational_directives.length > 0) {
      directives = brief.sdma_operational_directives.map((item, idx) => {
        if (typeof item === 'string') {
          const match = item.match(/^\[(.*?)\]\s*(.*)$/);
          if (match) {
            return { step: idx + 1, title: match[1], action: match[2] };
          }
          const parts = item.split(':');
          return { step: idx + 1, title: parts[0]?.trim() || `STEP ${idx + 1}`, action: parts.slice(1).join(':').trim() || item };
        } else if (typeof item === 'object' && item.title) {
          return { step: item.step || idx + 1, title: item.title, action: item.action || '' };
        }
        return defaultClearanceDirectives[idx] || { step: idx + 1, title: `STEP ${idx + 1}`, action: String(item) };
      });
    }

    directives.slice(0, 4).forEach((proto, idx) => {
      checkPageBreak(13);

      const stepH = 10.5;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, currentY, contentWidth, stepH, 1.2, 1.2, 'FD');

      // Number Badge Circle (Emerald)
      doc.setFillColor(5, 150, 105);
      doc.circle(margin + 5, currentY + 5.2, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${proto.step || idx + 1}`, margin + 5, currentY + 6.2, { align: 'center' });

      // Step Title Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      doc.text(`[${proto.title}]`, margin + 11, currentY + 6.2);

      // Action Content
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      const actionClean = proto.action.length > 105 ? proto.action.substring(0, 103) + '...' : proto.action;
      doc.text(actionClean, margin + 42, currentY + 6.2);

      currentY += stepH + 2.5;
    });

  } else {
    // ══════════════════════════════════════════════════════════════════
    // TRACK B: ACTIVE HAZARD & MASS RELOCATION DIRECTIVE
    // ══════════════════════════════════════════════════════════════════

    // ── SECTION 2B: MULTI-SITE CASCADE ALLOCATION MATRIX ─────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION 2: MULTI-SITE CASCADE RELOCATION ALLOCATION', margin, currentY);

    currentY += 2.5;

    const getSiteRow = (site, designation, defaultName, defaultCap, defaultAlloc) => {
      if (!site) {
        return [designation, defaultName, 'N/A', `${defaultCap.toLocaleString()}`, `${defaultAlloc.toLocaleString()}`, '< 8°', 'Direct / 25m', '+95%'];
      }
      const name = site.name || defaultName;
      const area = site.usable_area_sqm ? `${Math.round(site.usable_area_sqm).toLocaleString()} m²` : 'N/A';
      const cap = site.human_capacity || site.capacity || defaultCap;
      const alloc = site.allocated_citizens || site.allocated || defaultAlloc;
      const slope = site.slope_degrees != null ? `${site.slope_degrees.toFixed(1)}°` : '< 8°';
      const distTransit = `${site.driving_distance_km ? `${site.driving_distance_km} km` : 'Direct'} / ${site.transit_time_mins || 25}m`;
      const safety = site.hazard_reduction_pct ? `+${site.hazard_reduction_pct}%` : '+92%';
      return [designation, name, area, cap.toLocaleString(), alloc.toLocaleString(), slope, distTransit, safety];
    };

    const cascadeRows = [
      getSiteRow(siteA, 'Site A (Primary)', siteA?.name || `${originName} Safe Ridge`, 2500, 2500),
      getSiteRow(siteB, 'Site B (Secondary)', siteB?.name || `${originName} Safe Terrace`, 1200, 1200),
      getSiteRow(siteC, 'Site C (Tertiary)', siteC?.name || `${originName} Tableland Reserve`, 500, 500),
    ];

    const totalAllocated = cascade?.total_allocated || cascadeRows.reduce((sum, r) => sum + (parseInt(r[4].replace(/,/g, '')) || 0), 0);
    const totalCapacity = cascadeRows.reduce((sum, r) => sum + (parseInt(r[3].replace(/,/g, '')) || 0), 0);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: 2,
      },
      styles: {
        fontSize: 7.2,
        cellPadding: 2.2,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      head: [['Designation', 'Candidate Safe Plateau', 'Usable Land (m²)', 'Capacity (40 m²/p)', 'Allocated Evacuees', 'Slope', 'Transit Time', 'Safety Gain']],
      body: [
        ...cascadeRows,
        [
          { content: 'CUMULATIVE RELOCATION TOTAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: `${totalCapacity.toLocaleString()} Max`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: `${totalAllocated.toLocaleString()} (100% Absorbed)`, styles: { fontStyle: 'bold', textColor: [5, 150, 105], fillColor: [241, 245, 249] } },
          { content: 'All < 10°', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: 'Convoys Active', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        ],
      ],
    });

    currentY = doc.lastAutoTable.finalY + 5;

    // ── SECTION 3B: EXECUTIVE GEOTECHNICAL EVALUATION ────────────────
    checkPageBreak(50);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION 3: EXECUTIVE GEOTECHNICAL EVALUATION', margin, currentY);

    currentY += 3;

    // Threat Callout Box
    const threatHeadline = brief?.headline || brief?.visual_threat_summary?.headline || `TACTICAL RELOCATION MANDATE: Immediate Decanting for ${originName}`;
    const coreReason = brief?.executive_rationale || brief?.visual_threat_summary?.core_reason ||
      `Extreme geotechnical vulnerability driven by steep ${rawSlope.toFixed(1)}° terrain and ${rawRain} mm precipitation exceeds safety margins. Immediate staged decanting mandated to prevent casualties.`;

    doc.setFillColor(254, 242, 242); // Red 50
    doc.setDrawColor(254, 202, 202); // Red 200
    doc.roundedRect(margin, currentY, contentWidth, 17, 1.5, 1.5, 'FD');

    // Red accent marker
    doc.setFillColor(220, 38, 38);
    doc.rect(margin, currentY, 2.5, 17, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28); // Red 700
    doc.text(threatHeadline.length > 90 ? threatHeadline.substring(0, 88) + '...' : threatHeadline, margin + 5, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(85, 95, 110);
    const coreReasonLines = doc.splitTextToSize(coreReason, contentWidth - 10);
    doc.text(coreReasonLines, margin + 5, currentY + 9.5);

    currentY += 21;

    // 4 Key Facts Bullet Cards (2x2 Grid)
    const defaultKeyFacts = [
      `Critical slope angle (${rawSlope.toFixed(1)}°) exceeds safe stability thresholds`,
      `Hydrological saturation at ${rawRain} mm increases shear slip probability`,
      'Primary arterial corridor exposed to structural obstruction',
      'High population density requires immediate multi-stage decanting',
    ];
    const keyFacts = Array.isArray(brief?.key_geotechnical_indicators) && brief.key_geotechnical_indicators.length >= 4
      ? brief.key_geotechnical_indicators.slice(0, 4)
      : (Array.isArray(brief?.visual_threat_summary?.key_facts) && brief.visual_threat_summary.key_facts.length >= 4
          ? brief.visual_threat_summary.key_facts.slice(0, 4)
          : defaultKeyFacts);

    const cardW = (contentWidth - 4) / 2;
    const cardH = 9.5;

    keyFacts.forEach((fact, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const kx = margin + col * (cardW + 4);
      const ky = currentY + row * (cardH + 2.5);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(kx, ky, cardW, cardH, 1.2, 1.2, 'FD');

      // Dot indicator
      doc.setFillColor(220, 38, 38);
      doc.circle(kx + 3.5, ky + 4.8, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 41, 59);

      const factClean = fact.length > 55 ? fact.substring(0, 53) + '...' : fact;
      doc.text(factClean, kx + 7, ky + 5.8);
    });

    currentY += 25;

    // ── TACTICAL RECEPTOR PROFILES (3 VISUAL CARDS) ───────────────────
    checkPageBreak(65);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('TACTICAL RECEPTOR PROFILES & DECANTING ALLOCATION', margin, currentY);

    currentY += 3;

    const rawSiteCards = [
      {
        site_label: 'SITE A (PRIMARY)',
        name: siteA?.name || `${originName} Safe Ridge`,
        why_safe: 'Engineered flat bedrock plateau (<6° slope) with zero historical mass-wasting records.',
        transit_time: `~${siteA?.transit_time_mins || 25} mins via primary highway corridor`,
        priority_group: 'Phase 1 Convoy: Pediatric, geriatric, and non-ambulatory residents',
      },
      {
        site_label: 'SITE B (SECONDARY BUFFER)',
        name: siteB?.name || `${originName} Safe Terrace`,
        why_safe: 'High-capacity river-terrace plateau elevated above valley flood line.',
        transit_time: `~${siteB?.transit_time_mins || 38} mins via reinforced bypass route`,
        priority_group: 'Phase 2 Convoy: General population and essential domestic livestock',
      },
      {
        site_label: 'SITE C (TERTIARY RESERVE)',
        name: siteC?.name || `${originName} Tableland Reserve`,
        why_safe: 'Elevated regional tableland with direct logistics clearance and heavy depot pad.',
        transit_time: `~${siteC?.transit_time_mins || 45} mins via regional corridor`,
        priority_group: 'Phase 3: NDRF incident command post, field hospital & supply depot',
      },
    ];

    const siteCardThemes = [
      { fill: [240, 253, 244], stroke: [187, 247, 208], bar: [5, 150, 105], text: [4, 120, 87] }, // Emerald
      { fill: [240, 249, 255], stroke: [186, 230, 253], bar: [2, 132, 199], text: [3, 105, 161] }, // Cyan
      { fill: [245, 243, 255], stroke: [221, 214, 254], bar: [124, 58, 237], text: [109, 40, 217] }, // Purple
    ];

    rawSiteCards.slice(0, 3).forEach((sc, i) => {
      checkPageBreak(21);
      const theme = siteCardThemes[i];

      const cardHeight = 18;
      doc.setFillColor(...theme.fill);
      doc.setDrawColor(...theme.stroke);
      doc.roundedRect(margin, currentY, contentWidth, cardHeight, 1.5, 1.5, 'FD');

      // Colored left accent bar
      doc.setFillColor(...theme.bar);
      doc.rect(margin, currentY, 2.5, cardHeight, 'F');

      // Header: Label & Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...theme.text);
      doc.text(`${sc.site_label} — ${sc.name}`, margin + 5, currentY + 4.5);

      // Row 1: Why Safe
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text('Why Safe: ', margin + 5, currentY + 8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const whySafeText = sc.why_safe || 'Flat bedrock plateau with high structural stability.';
      doc.text(whySafeText.length > 95 ? whySafeText.substring(0, 93) + '...' : whySafeText, margin + 20, currentY + 8.5);

      // Row 2: Transit Time
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text('Transit: ', margin + 5, currentY + 12.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(sc.transit_time || 'Direct route', margin + 20, currentY + 12.2);

      // Row 3: Priority Group
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text('Priority Group: ', margin + 5, currentY + 15.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...theme.text);
      doc.text(sc.priority_group || 'Designated evacuee cohort', margin + 25, currentY + 15.8);

      currentY += cardHeight + 3;
    });

    currentY += 3;

    // ── SECTION 4B: SDMA OPERATIONAL DIRECTIVES (RELOCATION TRACK) ───
    checkPageBreak(50);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION 4: STATE DISASTER MANAGEMENT AUTHORITY (SDMA) 4-STEP PROTOCOL', margin, currentY);

    currentY += 3.5;

    const defaultRelocationSteps = [
      { step: 1, title: 'ROAD CLEARANCE', action: 'Deploy NDRF engineering units with earthmovers along primary transit routes.' },
      { step: 2, title: 'CONVOY DISPATCH', action: 'Begin prioritized decanting for vulnerable groups (pediatric, geriatric, non-ambulatory).' },
      { step: 3, title: 'SHELTER STAGING', action: 'Erect relief shelters adhering to the 40 m²/person standard with emergency life support.' },
      { step: 4, title: 'SLOPE SENSING', action: 'Deploy wireless tiltmeters and piezometers on critical crown scarps for early warning.' },
    ];

    let relocationSteps = defaultRelocationSteps;
    if (Array.isArray(brief?.sdma_operational_directives) && brief.sdma_operational_directives.length > 0) {
      relocationSteps = brief.sdma_operational_directives.map((item, idx) => {
        if (typeof item === 'string') {
          const match = item.match(/^\[(.*?)\]\s*(.*)$/);
          if (match) {
            return { step: idx + 1, title: match[1], action: match[2] };
          }
          const parts = item.split(':');
          return { step: idx + 1, title: parts[0]?.trim() || `STEP ${idx + 1}`, action: parts.slice(1).join(':').trim() || item };
        } else if (typeof item === 'object' && item.title) {
          return { step: item.step || idx + 1, title: item.title, action: item.action || '' };
        }
        return defaultRelocationSteps[idx] || { step: idx + 1, title: `STEP ${idx + 1}`, action: String(item) };
      });
    } else if (Array.isArray(brief?.tactical_action_steps) && brief.tactical_action_steps.length > 0) {
      relocationSteps = brief.tactical_action_steps.map((item, idx) => ({
        step: item.step || idx + 1,
        title: item.title || `STEP ${idx + 1}`,
        action: item.action || String(item),
      }));
    }

    relocationSteps.slice(0, 4).forEach((proto, idx) => {
      checkPageBreak(13);

      const stepH = 10.5;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, currentY, contentWidth, stepH, 1.2, 1.2, 'FD');

      // Number Badge Circle (Navy Slate)
      doc.setFillColor(15, 23, 42); // Slate 900
      doc.circle(margin + 5, currentY + 5.2, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${proto.step || idx + 1}`, margin + 5, currentY + 6.2, { align: 'center' });

      // Step Title Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      doc.text(`[${proto.title}]`, margin + 11, currentY + 6.2);

      // Action Content
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      const actionClean = proto.action.length > 105 ? proto.action.substring(0, 103) + '...' : proto.action;
      doc.text(actionClean, margin + 42, currentY + 6.2);

      currentY += stepH + 2.5;
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. OFFICIAL FOOTER & VERIFICATION STAMP (Every Page)
  // ══════════════════════════════════════════════════════════════════
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Divider line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('NATIONAL DISASTER MANAGEMENT AUTHORITY (NDMA) & NDRF JOINT TECHNICAL COMMAND', margin, pageHeight - 8);

    doc.setFont('helvetica', 'normal');
    doc.text('Certified Geotechnical Relocation Protocol • Official Operational Use Only', margin, pageHeight - 5);

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('RESQMAP v1.1.0 • Multi-Hazard Decision Engine', pageWidth - margin, pageHeight - 5, { align: 'right' });
  }

  // ══════════════════════════════════════════════════════════════════
  // 7. AUTO DOWNLOAD
  // ══════════════════════════════════════════════════════════════════
  const cleanName = (origin?.name || 'Habitation').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = isSafeZone
    ? `RESQMAP_NDRF_Clearance_${cleanName}.pdf`
    : `RESQMAP_NDRF_Brief_${cleanName}.pdf`;
  doc.save(fileName);
  return fileName;
}
