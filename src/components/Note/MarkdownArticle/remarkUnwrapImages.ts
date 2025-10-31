import type { Paragraph, Root, Image, Link, Content } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Remark plugin to unwrap images from paragraphs
 * This prevents the DOM nesting warning where <div> (Image component) appears inside <p>
 * 
 * Markdown wraps standalone images in paragraphs. This plugin unwraps them at the AST level
 * so they render directly without a <p> wrapper.
 */
export const remarkUnwrapImages: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== 'number') return

      const children = node.children
      
      // Case 1: Paragraph contains only an image: ![alt](url)
      if (children.length === 1 && children[0].type === 'image') {
        // Replace the paragraph with the image directly
        const image = children[0] as Image
        parent.children.splice(index, 1, image)
        return
      }

      // Case 2: Paragraph contains only a link with an image: [![alt](url)](link)
      if (children.length === 1 && children[0].type === 'link') {
        const link = children[0] as Link
        if (link.children.length === 1 && link.children[0].type === 'image') {
          // Keep the link but remove the paragraph wrapper
          parent.children.splice(index, 1, link)
          return
        }
      }

      // Case 3: Paragraph contains text and an image (less common but should handle)
      // We'll leave these as-is since they're mixed content
      // The paragraph handler in the component will still try to convert them to divs
    })
  }
}

