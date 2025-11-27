// Re-export Heroicons components for consistent icon usage
import { StarIcon as StarOutlineHero } from '@heroicons/react/24/outline'
import { StarIcon as StarSolidHero, TrashIcon, PencilSquareIcon, PaperClipIcon } from '@heroicons/react/24/solid'
import React from 'react'

export function StarSolid(props){
  return <StarSolidHero {...props} className={props.className || ''} />
}
export function StarOutline(props){
  return <StarOutlineHero {...props} className={props.className || ''} />
}
export function Pencil(props){
  return <PencilSquareIcon {...props} className={props.className || ''} />
}
export function Trash(props){
  return <TrashIcon {...props} className={props.className || ''} />
}
export function Paperclip(props){
  return <PaperClipIcon {...props} className={props.className || ''} />
}
