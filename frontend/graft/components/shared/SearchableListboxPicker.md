# components/shared/SearchableListboxPicker.tsx

- SearchableListboxOption · type · L15-L19 — type SearchableListboxOption = { id: string; title: string; subtitle?: string; };
- SearchableListboxPickerProps · interface · L21-L59 — interface SearchableListboxPickerProps
- SearchableListboxPicker · function · L65-L365 — function SearchableListboxPicker({ options, search, onSearchChange, searchPlaceholder, selectedOptionId, onSelectOption, disabled = false, listboxAriaLabel, noMatchMessage, emptyStateMessage, inputId, listboxId, emptyNoMatch = false, listPresentation = "inline", listboxZIndex = 200, listOpen: listOpenProp, onListOpenChange, inputType = "search", enterKeyHint: enterKeyHintProp, ariaLabelledBy, spellCheck = false, showTrailingClear = false, trailingClearAriaLabel = "Clear", onTrailingClear, }: SearchableListboxPickerProps)
- onResizeOrScroll · function · L152-L152 — onResizeOrScroll = ()
- onDocDown · function · L163-L168 — function onDocDown(e: MouseEvent)
