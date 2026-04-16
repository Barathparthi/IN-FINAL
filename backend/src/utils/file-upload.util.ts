import multer from 'multer'

const MAX_EXTRACTED_CHARS = 8000

export const resumeUpload = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files are allowed'))
  },
})

function normalizeExtractedText(input: string): string {
  return input
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
}

function looksLikePdfBinaryDump(text: string): boolean {
  if (!text) return true
  const sample = text.slice(0, 3000)

  if (/^%PDF-\d\.\d/i.test(sample) && /(endobj|stream|xref|trailer)/i.test(sample)) {
    return true
  }

  const alphaCount = (sample.match(/[A-Za-z]/g) || []).length
  const printableCount = (sample.match(/[ -~]/g) || []).length || 1
  const alphaRatio = alphaCount / printableCount

  return alphaRatio < 0.18
}

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  try {
    const mod: any = await import('pdf-parse')
    const pdfParse = mod?.default || mod
    const result = await pdfParse(buffer)
    return normalizeExtractedText(String(result?.text || ''))
  } catch (err: any) {
    console.warn('[PDF] pdf-parse extraction failed:', err?.message || err)
    return ''
  }
}

async function loadPdfJsLib(): Promise<any | null> {
  try {
    const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
    const mod = await nativeImport('pdfjs-dist/legacy/build/pdf.mjs')
    return mod?.default || mod
  } catch {
    try {
      return require('pdfjs-dist/legacy/build/pdf.js')
    } catch {
      return null
    }
  }
}

async function extractWithPdfJs(buffer: Buffer): Promise<string> {
  try {
    const pdfjsLib = await loadPdfJsLib()
    if (!pdfjsLib?.getDocument) {
      console.warn('[PDF] pdfjs-dist loader unavailable in this runtime')
      return ''
    }

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise

    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const tokens = (content.items || [])
        .map((item: any) => String(item?.str || '').trim())
        .filter(Boolean)

      if (tokens.length > 0) pages.push(tokens.join(' '))
    }

    return normalizeExtractedText(pages.join('\n\n'))
  } catch (err: any) {
    console.warn('[PDF] pdfjs-dist extraction failed:', err?.message || err)
    return ''
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parsed = await extractWithPdfParse(buffer)
  if (parsed && !looksLikePdfBinaryDump(parsed)) {
    return parsed.slice(0, MAX_EXTRACTED_CHARS)
  }

  const parsedWithPdfJs = await extractWithPdfJs(buffer)
  if (parsedWithPdfJs && !looksLikePdfBinaryDump(parsedWithPdfJs)) {
    return parsedWithPdfJs.slice(0, MAX_EXTRACTED_CHARS)
  }

  console.warn('[PDF] No readable text extracted. Storing empty resumeText instead of binary garbage.')
  return ''
}