'use client'

import * as React from 'react'
import { AlertDialog as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Button } from './button'

const AlertDialog = Primitive.Root
const AlertDialogTrigger = Primitive.Trigger

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <Primitive.Content className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl', className)} {...props} />
    </Primitive.Portal>
  )
}

const AlertDialogTitle = ({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) => <Primitive.Title className={cn('text-lg font-semibold', className)} {...props} />
const AlertDialogDescription = ({ className, ...props }: React.ComponentProps<typeof Primitive.Description>) => <Primitive.Description className={cn('mt-2 text-sm text-muted-foreground', className)} {...props} />
const AlertDialogCancel = ({ children = '취소', ...props }: React.ComponentProps<typeof Primitive.Cancel>) => <Primitive.Cancel asChild {...props}><Button variant="outline">{children}</Button></Primitive.Cancel>
const AlertDialogAction = ({ children, ...props }: React.ComponentProps<typeof Primitive.Action>) => <Primitive.Action asChild {...props}><Button variant="destructive">{children}</Button></Primitive.Action>

export { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction }
