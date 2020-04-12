export type ContentAttributes = {
    title: string | null
    isLongform: boolean
}

export type ContentTrigger = (contentElem: HTMLElement) => void
