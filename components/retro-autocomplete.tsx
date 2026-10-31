"use client";

import { useId, useRef, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { ChevronDown } from "lucide-react";

type Option = { value: string; label?: string };
type Props = { label: string; value: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; maxLength: number };

export function RetroAutocomplete({ label, value, onChange, options, placeholder, maxLength }: Props) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return <div className="retro-field">
    <label htmlFor={id}>{label}</label>
    <Autocomplete.Root
      items={options}
      value={value}
      onValueChange={onChange}
      itemToStringValue={option => option.value}
      filter={(option, query) => `${option.value} ${option.label ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())}
      open={open}
      onOpenChange={(next, details) => { if (!next && details.reason === "escape-key") details.event.preventDefault(); setOpen(next); }}
      openOnInputClick
      modal={false}
    >
      <Autocomplete.InputGroup ref={anchor} className="retro-combo">
        <Autocomplete.Input id={id} aria-label={label} placeholder={placeholder} maxLength={maxLength} autoComplete="off" onKeyDown={event => { if (event.key === "Escape" && open) event.stopPropagation(); }}/>
        <Autocomplete.Trigger className="retro-combo-trigger" aria-label={`展开${label}选项`}><ChevronDown size={16}/></Autocomplete.Trigger>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner anchor={anchor} sideOffset={4} align="start" className="retro-combo-positioner">
          <Autocomplete.Popup className="retro-combo-menu" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
            <Autocomplete.List className="retro-combo-list">
              {(option: Option) => <Autocomplete.Item key={option.value} value={option} className="retro-combo-option" data-current={value === option.value || undefined}><span>{option.value}</span>{option.label && <small>{option.label}</small>}</Autocomplete.Item>}
            </Autocomplete.List>
            <Autocomplete.Empty className="retro-combo-empty">无匹配项</Autocomplete.Empty>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  </div>;
}
