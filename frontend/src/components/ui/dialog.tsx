import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, title, children, className }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
    >
      <Card
        className={cn("w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>{title}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
        )}
        <CardContent className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {children}
        </CardContent>
      </Card>
    </div>
  );
};

Dialog.displayName = "Dialog";

