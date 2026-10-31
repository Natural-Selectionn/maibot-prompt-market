"use client";

import { useId, useState } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string };
type Props = { label: string; value: string; onChange: (value: string) => void; options: Option[]; className?: string; hideLabel?: boolean };

export function RetroSelect({ label, value, onChange, options, className = "", hideLabel = false }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <div className={`retro-field ${className}`}>
    <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>{label}</label>
    <Select.Root
      items={options}
      value={value}
      onValueChange={next => onChange(next ?? "")}
      open={open}
      onOpenChange={(next, details) => { if (!next && details.reason === "escape-key") details.event.preventDefault(); setOpen(next); }}
      modal={false}
    >
      <Select.Trigger id={id} aria-label={label} className="retro-combo retro-select" onKeyDown={event => { if (event.key === "Escape" && open) event.stopPropagation(); }}>
        <Select.Value className="retro-select-value"/>
        <Select.Icon className="retro-combo-trigger"><ChevronDown size={16}/></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" alignItemWithTrigger={false} sideOffset={4} className="retro-combo-positioner">
          <Select.Popup className="retro-combo-menu" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
            <Select.List className="retro-combo-list">
              {options.map(option => <Select.Item key={option.value} value={option.value} className="retro-combo-option retro-select-option">
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="retro-select-check"><Check size={14}/></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </div>;
}
