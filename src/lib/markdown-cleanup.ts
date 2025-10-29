/**
 * Markdown cleanup utility for leftover markdown syntax after Asciidoc rendering
 */

export function cleanupMarkdown(html: string): string {
  let cleaned = html

  // Clean up markdown image syntax: ![alt](url)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const altText = alt || ''
    return `<img src="${url}" alt="${altText}" class="max-w-[400px] object-contain my-0" />`
  })

  // Clean up markdown link syntax: [text](url)
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    // Check if it's already an HTML link
    if (cleaned.includes(`href="${url}"`)) {
      return _match
    }
    return `<a href="${url}" target="_blank" rel="noreferrer noopener" class="break-words inline-flex items-baseline gap-1">${text} <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>`
  })

  // Clean up markdown table syntax
  cleaned = cleanupMarkdownTables(cleaned)

  return cleaned
}

function cleanupMarkdownTables(html: string): string {
  // Simple markdown table detection and conversion
  const tableRegex = /(\|.*\|[\r\n]+\|[\s\-\|]*[\r\n]+(\|.*\|[\r\n]+)*)/g
  
  return html.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n').filter(line => line.trim())
    if (lines.length < 2) return match

    const headerRow = lines[0]
    const separatorRow = lines[1]
    const dataRows = lines.slice(2)

    // Check if it's actually a table (has separator row with dashes)
    if (!separatorRow.includes('-')) return match

    const headers = headerRow.split('|').map(cell => cell.trim()).filter(cell => cell)
    const rows = dataRows.map(row => 
      row.split('|').map(cell => cell.trim()).filter(cell => cell)
    )

    let tableHtml = '<table class="min-w-full border-collapse border border-gray-300 my-4">\n'
    
    // Header
    tableHtml += '  <thead>\n    <tr>\n'
    headers.forEach(header => {
      tableHtml += `      <th class="border border-gray-300 px-4 py-2 bg-gray-50 font-semibold text-left">${header}</th>\n`
    })
    tableHtml += '    </tr>\n  </thead>\n'
    
    // Body
    tableHtml += '  <tbody>\n'
    rows.forEach(row => {
      tableHtml += '    <tr>\n'
      row.forEach((cell, index) => {
        const tag = index < headers.length ? 'td' : 'td'
        tableHtml += `      <${tag} class="border border-gray-300 px-4 py-2">${cell}</${tag}>\n`
      })
      tableHtml += '    </tr>\n'
    })
    tableHtml += '  </tbody>\n'
    tableHtml += '</table>'

    return tableHtml
  })
}
