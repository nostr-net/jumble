import type { PhrasingContent, Root, Text } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

const HASHTAG_REGEX = /#([a-zA-Z0-9_]+)/g

export const remarkHashtags: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || typeof index !== 'number') return

      const text = node.value
      const matches = Array.from(text.matchAll(HASHTAG_REGEX))

      if (matches.length === 0) return

      const children: PhrasingContent[] = []
      let lastIndex = 0

      matches.forEach((match) => {
        const matchStart = match.index!
        const matchEnd = matchStart + match[0].length
        const hashtag = match[1]

        // Add text before the hashtag
        if (matchStart > lastIndex) {
          children.push({
            type: 'text',
            value: text.slice(lastIndex, matchStart)
          })
        }

        // Create a link node for the hashtag
        children.push({
          type: 'link',
          url: `/notes?t=${hashtag.toLowerCase()}`,
          children: [
            {
              type: 'text',
              value: `#${hashtag}`
            }
          ]
        })

        lastIndex = matchEnd
      })

      // Add remaining text after the last match
      if (lastIndex < text.length) {
        children.push({
          type: 'text',
          value: text.slice(lastIndex)
        })
      }

      // Replace the text node with the processed children
      parent.children.splice(index, 1, ...children)
    })
  }
}

