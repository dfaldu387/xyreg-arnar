import { supabase } from '@/integrations/supabase/client';

/**
 * Extract text from uploaded documents (PDF, DOCX, XLSX, TXT)
 * Reuses existing extraction patterns from the project.
 */
export async function extractTextFromChecklistFile(file: File): Promise<string> {
  const { type, name } = file;

  // Plain text
  if (type === 'text/plain' || name.endsWith('.txt') || name.endsWith('.csv')) {
    return await file.text();
  }

  // XLSX — client-side with xlsx library
  if (type.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      lines.push(`--- Sheet: ${sheetName} ---`);
      lines.push(csv);
    }
    return lines.join('\n');
  }

  // DOCX — client-side with mammoth
  if (type.includes('wordprocessingml') || type.includes('msword') || name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  // PDF — use the existing edge function for server-side extraction
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('action', 'extract_text');

    const { data, error } = await supabase.functions.invoke('ai-document-analyzer', {
      body: formData,
    });

    if (error) throw new Error(`PDF extraction failed: ${error.message}`);
    return data?.extracted_text || '';
  }

  throw new Error(`Unsupported file type: ${type || name}`);
}
