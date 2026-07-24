import { PDFDocument } from 'pdf-lib';

// --- Interfaces & Types ---
interface PdfMetadata {
  name: string;
  sizeBytes: number;
  sizeString: string;
  widthMm: number;
  heightMm: number;
  drawingSize: string;
  error?: string;
}

// --- State Management ---
let allFilesData: PdfMetadata[] = [];

// --- DOM Elements ---
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLSpanElement;
const controlsSection = document.getElementById('controls-section') as HTMLElement;
const resultsTable = document.getElementById('results-table') as HTMLTableElement;
const resultsBody = document.getElementById('results-body') as HTMLTableSectionElement;
const resultsSummary = document.getElementById('results-summary') as HTMLDivElement;

const filterPageSize = document.getElementById('filter-page-size') as HTMLSelectElement;
const filterFileSize = document.getElementById('filter-file-size') as HTMLSelectElement;

// --- Event Listeners ---
fileInput.addEventListener('change', handleFilesUpload);
filterPageSize.addEventListener('change', renderTable);
filterFileSize.addEventListener('change', renderTable);

// --- Core Logic ---
async function handleFilesUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const files = Array.from(target.files);
  console.log(`Starting process for ${files.length} files...`);
  
  allFilesData = []; // reset state
  
  // UI Updates
  progressContainer.classList.remove('hidden');
  controlsSection.classList.add('hidden');
  resultsTable.classList.add('hidden');
  resultsBody.innerHTML = '';

  // Process sequentially to avoid memory overload with hundreds of PDFs
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Update progress
    const percent = Math.round(((i + 1) / files.length) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Processing ${i + 1} / ${files.length} files...`;

    // Force the browser to render the UI updates before doing heavy PDF math
    await new Promise(resolve => setTimeout(resolve, 15));

    try {
      const data = await processSinglePdf(file);
      allFilesData.push(data);
    } catch (error) {
      console.error(`Error reading ${file.name}:`, error);
      allFilesData.push({
        name: file.name,
        sizeBytes: file.size,
        sizeString: formatBytes(file.size),
        widthMm: 0,
        heightMm: 0,
        drawingSize: 'ERROR',
        error: 'Failed to read PDF'
      });
    }
  }

  // Clear the input so you can upload the exact same batch again if needed
  target.value = '';

  // Finalize UI
  progressContainer.classList.add('hidden');
  controlsSection.classList.remove('hidden');
  resultsTable.classList.remove('hidden');
  renderTable();
}

async function processSinglePdf(file: File): Promise<PdfMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load PDF natively in browser (ignoring encryption errors if they exist)
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  
  // Usually, renditioned drawings have a consistent page size across the doc, we check page 1.
  const page = pdfDoc.getPage(0);
  const { width, height } = page.getSize(); // PDF sizes are in Points (1/72 inch)

  // Convert points to millimeters (1 point = 0.352778 mm)
  const ptToMm = 0.352778;
  const widthMm = Math.round(width * ptToMm);
  const heightMm = Math.round(height * ptToMm);

  const drawingSize = classifyDrawingSize(widthMm, heightMm);

  return {
    name: file.name,
    sizeBytes: file.size,
    sizeString: formatBytes(file.size),
    widthMm,
    heightMm,
    drawingSize
  };
}

// --- Utilities ---
function classifyDrawingSize(w: number, h: number): string {
  // Sort dimensions to handle landscape vs portrait
  const shortEdge = Math.min(w, h);
  const longEdge = Math.max(w, h);

  // Standard ISO A-Series with +/- 5mm tolerance for bounding box margins
  const isApprox = (val: number, target: number) => Math.abs(val - target) <= 5;

  if (isApprox(shortEdge, 841) && isApprox(longEdge, 1189)) return 'A0';
  if (isApprox(shortEdge, 594) && isApprox(longEdge, 841)) return 'A1';
  if (isApprox(shortEdge, 420) && isApprox(longEdge, 594)) return 'A2';
  if (isApprox(shortEdge, 297) && isApprox(longEdge, 420)) return 'A3';
  if (isApprox(shortEdge, 210) && isApprox(longEdge, 297)) return 'A4';

  return 'NON-STANDARD';
}

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- Rendering & Filtering ---
function renderTable() {
  const pageSizeFilter = filterPageSize.value;
  const maxMbFilter = filterFileSize.value;

  const filteredData = allFilesData.filter(file => {
    // 1. Check Page Size
    if (pageSizeFilter !== 'ALL' && file.drawingSize !== pageSizeFilter) {
      return false;
    }
    // 2. Check File Size
    if (maxMbFilter !== 'ALL') {
      const maxBytes = parseFloat(maxMbFilter) * 1024 * 1024;
      if (file.sizeBytes > maxBytes) return false;
    }
    return true;
  });

  resultsBody.innerHTML = '';

  filteredData.forEach(file => {
    const tr = document.createElement('tr');
    
    if (file.error) {
      tr.innerHTML = `
        <td>${file.name}</td>
        <td>${file.sizeString}</td>
        <td colspan="2" class="error-text">Error: ${file.error}</td>
      `;
    } else {
      tr.innerHTML = `
        <td>${file.name}</td>
        <td>${file.sizeString}</td>
        <td>${file.widthMm} x ${file.heightMm}</td>
        <td><strong>${file.drawingSize}</strong></td>
      `;
    }
    resultsBody.appendChild(tr);
  });

  resultsSummary.textContent = `Showing ${filteredData.length} of ${allFilesData.length} files`;
}
