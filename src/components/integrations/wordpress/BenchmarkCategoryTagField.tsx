import { useMemo, useState, type ReactElement } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  addBenchmarkCategoryTag,
  BENCHMARK_CATEGORY_TAG_MAX_LENGTH,
  benchmarkCategoryTagKey,
  collectBenchmarkCategoryTags,
  normalizeBenchmarkCategoryTag,
} from "@/lib/benchmark-category-tags";
import { RowButton } from "@/ui";

const PLACEHOLDER = "Benchmark category tag";

export function BenchmarkCategoryTagField({
  value,
  onChange,
  onCommit,
  chrome,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (tag: string | undefined) => void;
  chrome: "dark" | "light";
  className?: string;
}): ReactElement {
  const { sites } = useWordPressSites();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = useMemo(
    () => collectBenchmarkCategoryTags(sites, [value]),
    [sites, value],
  );

  const query = normalizeBenchmarkCategoryTag(search);
  const queryKey = query ? benchmarkCategoryTagKey(query) : "";
  const filtered = query
    ? options.filter((tag) => tag.toLocaleLowerCase().includes(queryKey))
    : options;
  const canAdd = Boolean(query) && !options.some((tag) => benchmarkCategoryTagKey(tag) === queryKey);
  const selected = value.trim();
  const isDark = chrome === "dark";

  const commit = (raw: string) => {
    const label = normalizeBenchmarkCategoryTag(raw);
    if (label) addBenchmarkCategoryTag(label);
    onChange(label);
    onCommit(label || undefined);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <RowButton
          selected={Boolean(isDark)}
          type="button"
          id="benchmarkCustomTag"
          aria-label={PLACEHOLDER}
        >
          <span className="min-w-0 flex-1 break-words">{selected || PLACEHOLDER}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </RowButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] rounded-none border-0 bg-[#000] p-1 text-white shadow-lg"
      >
        <Command shouldFilter={false} className="rounded-none bg-transparent text-white">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={PLACEHOLDER}
            maxLength={BENCHMARK_CATEGORY_TAG_MAX_LENGTH}
            className="h-9 text-base text-white placeholder:text-muted-foreground"
          />
          <CommandList className="max-h-48">
            {selected ? (
              <CommandItem
                value="__clear__"
                className="rounded-none text-base text-muted-foreground"
                onSelect={() => commit("")}
              >
                Clear
              </CommandItem>
            ) : null}
            <CommandGroup>
              {filtered.map((tag) => {
                const active = benchmarkCategoryTagKey(tag) === benchmarkCategoryTagKey(selected);
                return (
                  <CommandItem
                    key={tag}
                    value={tag}
                    className="rounded-none text-base text-white data-[selected]:bg-[#09090B] data-[selected]:text-white"
                    onSelect={() => commit(tag)}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 break-words">{tag}</span>
                  </CommandItem>
                );
              })}
              {canAdd ? (
                <CommandItem
                  value={`__add__${query}`}
                  className="rounded-none text-base text-white data-[selected]:bg-[#09090B] data-[selected]:text-white"
                  onSelect={() => commit(query)}
                >
                  Add "{query}"
                </CommandItem>
              ) : null}
            </CommandGroup>
            {!filtered.length && !canAdd ? (
              <CommandEmpty className="py-3 text-center text-base text-muted-foreground">
                Type a tag to add
              </CommandEmpty>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
