import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

type Props = { icon?: React.ReactNode; title?: string; subtitle?: string; height?: number };

const PlaceholderCard: React.FC<Props> = ({ icon, title = "Coming soon", subtitle, height = 140 }) => {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <div className="font-medium text-foreground">{title}</div>
            {subtitle && <div className="text-xs">{subtitle}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlaceholderCard;
