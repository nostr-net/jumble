import type { Paragraph, Root, Image, Link, RootContent } from 'mdast'
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
        parent.children.splice(index, 1, image as unknown as RootContent)
        return
      }

      // Case 2: Paragraph contains only a link with an image: [![alt](url)](link)
      if (children.length === 1 && children[0].type === 'link') {
        const link = children[0] as Link
        if (link.children.length === 1 && link.children[0].type === 'image') {
          // Keep the link but remove the paragraph wrapper
          parent.children.splice(index, 1, link as unknown as RootContent)
          return
        }
      }

      // Case 3: Paragraph contains images mixed with text
      // Split the paragraph: extract images as separate block elements, keep text in paragraph
      const imageIndices: number[] = []
      children.forEach((child, i) => {
        if (child.type === 'image') {
          imageIndices.push(i)
        } else if (child.type === 'link' && child.children.some(c => c.type === 'image')) {
          imageIndices.push(i)
        }
      })

      if (imageIndices.length > 0) {
        // We have images in the paragraph - need to split it
        const newNodes: RootContent[] = []
        let lastIndex = 0

        imageIndices.forEach((imgIndex) => {
          // Add text before the image as a paragraph (if any)
          if (imgIndex > lastIndex) {
            const textBefore = children.slice(lastIndex, imgIndex)
            if (textBefore.length > 0 && textBefore.some(c => c.type === 'text' && c.value.trim())) {
              newNodes.push({
                type: 'paragraph',
                children: textBefore
              } as unknown as RootContent)
            }
          }

          // Add the image as a separate block element
          const imageChild = children[imgIndex]
          if (imageChild.type === 'image') {
            newNodes.push(imageChild as unknown as RootContent)
          } else if (imageChild.type === 'link') {
            newNodes.push(imageChild as unknown as RootContent)
          }

          lastIndex = imgIndex + 1
        })

        // Add remaining text after the last image (if any)
        if (lastIndex < children.length) {
          const textAfter = children.slice(lastIndex)
          if (textAfter.length > 0 && textAfter.some(c => c.type === 'text' && c.value.trim())) {
            newNodes.push({
              type: 'paragraph',
              children: textAfter
            } as unknown as RootContent)
          }
        }

        // If we only had images and whitespace, just use the images
        if (newNodes.length === 0) {
          // All content was images, extract them
          children.forEach(child => {
            if (child.type === 'image') {
              newNodes.push(child as unknown as RootContent)
            } else if (child.type === 'link' && child.children.some(c => c.type === 'image')) {
              newNodes.push(child as unknown as RootContent)
            }
          })
        }

        // Replace the paragraph with the split nodes
        if (newNodes.length > 0) {
          parent.children.splice(index, 1, ...newNodes)
        }
      }
    })
  }
}

