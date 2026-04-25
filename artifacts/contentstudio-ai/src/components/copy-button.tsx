import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  label?: string;
  variant?: "default" | "outline" | "accent";
  className?: string;
  testId?: string;
}

export function CopyButton({
  text,
  label = "Copy",
  variant = "outline",
  className,
  testId,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const baseClasses = "rounded-md font-mono text-xs uppercase tracking-widest transition-colors";
  const variantClasses =
    variant === "accent"
      ? "bg-primary text-black hover:bg-[#D4EB3A]"
      : variant === "default"
        ? "bg-secondary hover:bg-secondary/80"
        : "border-border hover:border-primary hover:text-primary";

  return (
    <Button
      type="button"
      variant={variant === "outline" ? "outline" : undefined}
      onClick={handleCopy}
      className={cn(
        baseClasses,
        variantClasses,
        copied && "!bg-[#4ADE80] !text-black border-transparent",
        className,
      )}
      data-testid={testId}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 mr-1.5" /> Copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 mr-1.5" /> {label}
        </>
      )}
    </Button>
  );
}
