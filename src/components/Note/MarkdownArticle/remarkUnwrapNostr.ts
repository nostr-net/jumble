import type { Paragraph, Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { NostrNode } from './types'

/**
 * Remark plugin to unwrap nostr nodes from paragraphs
 * This prevents the DOM nesting warning where <div> (EmbeddedNote/EmbeddedMention) appears inside <p>
 * 
 * Markdown wraps standalone nostr references in paragraphs. This plugin unwraps them at the AST level
 * so they render directly without a <p> wrapper.
 */
export const remarkUnwrapNostr: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== 'number') return

      const children = node.children
      
      // Type guard to check if a node is a NostrNode
      const isNostrNode = (node: any): node is NostrNode => {
        return node && node.type === 'nostr'
      }
      
      // Case 1: Paragraph contains only a nostr node
      if (children.length === 1 && isNostrNode(children[0])) {
        // Replace the paragraph with the nostr node directly
        // Cast to RootContent since we're promoting it to block level
        const nostrNode = children[0] as unknown as RootContent
        parent.children.splice(index, 1, nostrNode)
        return
      }

      // Case 2: Paragraph contains text and a nostr node
      // If the paragraph only contains whitespace and a nostr node, unwrap it
      const hasOnlyNostrAndWhitespace = children.every(child => {
        if (isNostrNode(child)) return true
        if (child.type === 'text') {
          return !child.value.trim() // Only whitespace
        }
        return false
      })
      
      if (hasOnlyNostrAndWhitespace) {
        // Find the nostr node and unwrap it
        const nostrNode = children.find(isNostrNode)
        if (nostrNode) {
          // Cast to RootContent since we're promoting it to block level
          parent.children.splice(index, 1, nostrNode as unknown as RootContent)
          return
        }
      }

      // Case 3: Paragraph contains mixed content (text + nostr node)
      // We'll leave these as-is since they're mixed content
      // The paragraph handler in the component will convert them to divs
    })
  }
}

