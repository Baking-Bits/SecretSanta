// Re-export Heroicons components for consistent icon usage
import React from 'react'
import { StarIcon as StarOutlineHero } from '@heroicons/react/24/outline'
import { StarIcon as StarSolidHero, TrashIcon, PencilSquareIcon, PaperClipIcon } from '@heroicons/react/24/solid'

// Helper to render heroicons with sensible defaults so buttons show icons reliably
function renderIcon(IconComponent, props, defaults = {}){
  const { className, width, height, ...rest } = props || {}
  const finalProps = Object.assign({ width: 18, height: 18, 'aria-hidden': true, focusable: false }, defaults, rest)
  // ensure className is passed through (useful for CSS sizing)
  if (className) finalProps.className = className
  return React.createElement(IconComponent, finalProps)
}

export function StarSolid(props){ return renderIcon(StarSolidHero, props) }
export function StarOutline(props){ return renderIcon(StarOutlineHero, props) }
export function Pencil(props){ return renderIcon(PencilSquareIcon, props) }
export function Trash(props){ return renderIcon(TrashIcon, props) }
export function Paperclip(props){ return renderIcon(PaperClipIcon, props) }
