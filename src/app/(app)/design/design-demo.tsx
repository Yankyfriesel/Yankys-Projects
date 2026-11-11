"use client";

import {
  Archive,
  CheckCircle2,
  Layers,
  Printer,
  ShieldCheck,
  Snowflake,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const SWATCHES = [
  { name: "primary (wine)", hex: "#1f6f78", className: "bg-primary" },
  { name: "sidebar (charcoal)", hex: "#25221f", className: "bg-sidebar" },
  { name: "gold (accent)", hex: "#b8862b", className: "bg-gold" },
  { name: "brand (logo red)", hex: "#1a5f68", className: "bg-brand" },
  { name: "background (paper)", hex: "#f6f1e9", className: "bg-background ring-1 ring-border" },
  { name: "success", hex: "#047857", className: "bg-success" },
  { name: "warning", hex: "#b45309", className: "bg-warning" },
  { name: "info", hex: "#2563eb", className: "bg-info" },
  { name: "destructive", hex: "#dc2626", className: "bg-destructive" },
];

const ITEMS = [
  { he: "בריסקט (3) טרי מוסדי", en: "Brisket (3)", sku: "M1057D-C" },
  { he: "אסאדו שלם טרי מוסדי", en: "Whole Asado", sku: "M3031D-C" },
  { he: "פילה מדוחה (6) טרי", en: "Chuck Calachel (6)", sku: "M1064D-C" },
  { he: "נקנקיות בקר מעושנות", en: "Smoked beef frankfurters", sku: "N2101F-C" },
  { he: "הודו מעושן פרוס", en: "Sliced smoked turkey", sku: "N16001D-S" },
  { he: "שיפודי בקר מתובלים", en: "Seasoned beef skewers", sku: "N2020F-S" },
];

const CATEGORIES = [
  { name: "All items", count: 387, selected: true },
  { name: "Fresh beef", count: 42 },
  { name: "Frozen beef", count: 56 },
  { name: "Sausages", count: 21 },
  { name: "Burgers", count: 37 },
  { name: "Imported", count: 8 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function ItemCard({ item }: { item: (typeof ITEMS)[number] }) {
  return (
    <button
      type="button"
      className="flex flex-col gap-1.5 rounded-2xl bg-card p-4 text-start shadow-card ring-1 ring-border/60 transition hover:ring-primary/40"
    >
      <span className="text-xs font-semibold text-primary">Fresh beef</span>
      <span className="text-sm font-bold">{item.he}</span>
      <span dir="ltr" className="text-start text-xs text-muted-foreground">
        {item.en}
      </span>
      <span dir="ltr" className="mt-1 font-mono text-xs text-muted-foreground">
        {item.sku}
      </span>
    </button>
  );
}

function WarehouseCard({
  name,
  kg,
  boxes,
  status,
  tone,
  icon,
}: {
  name: string;
  kg: string;
  boxes: number;
  status: string;
  tone: "success" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const toneClass = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-destructive/5 text-destructive",
  }[tone];
  const StatusIcon =
    tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : XCircle;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <CardTitle>{name}</CardTitle>
            <p className="text-3xl font-extrabold tabular-nums">
              {kg} <span className="text-sm font-medium text-muted-foreground">kg</span>
            </p>
            <Badge variant="outline">{boxes} boxes</Badge>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-info-soft text-info [&_svg]:size-6">
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold",
            toneClass,
          )}
        >
          <StatusIcon className="size-4 shrink-0" />
          {status}
        </div>
      </CardContent>
    </Card>
  );
}

export function DesignDemo() {
  return (
    <div className="space-y-10">
      <Section title="Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {SWATCHES.map((s) => (
            <div
              key={s.name}
              className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/60"
            >
              <div className={cn("h-16", s.className)} />
              <div className="space-y-0.5 p-3 text-xs">
                <div className="font-bold">{s.name}</div>
                <div className="font-mono text-muted-foreground">{s.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="dark">Dark</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button size="lg">
              <Printer data-icon="inline-start" />
              Save and print
            </Button>
            <Button size="sm" variant="outline">
              Small
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="outline" onClick={() => toast.success("Saved")}>
              Show a toast
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section title="Status chips">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">
            <CheckCircle2 /> All boxes valid
          </Badge>
          <Badge variant="warning">
            <TriangleAlert /> 3 boxes expire soon
          </Badge>
          <Badge variant="destructive">
            <XCircle /> 2 boxes expired
          </Badge>
          <Badge variant="info">Connected to Priority</Badge>
          <Badge variant="soft">Required field</Badge>
          <Badge variant="secondary">Draft</Badge>
          <Badge variant="outline">42 items</Badge>
        </div>
      </Section>

      <Section title="Warehouse cards">
        <div className="grid gap-4 md:grid-cols-3">
          <WarehouseCard
            name="Main Warehouse"
            kg="5,997.34"
            boxes={368}
            status="All boxes valid"
            tone="success"
            icon={<Archive />}
          />
          <WarehouseCard
            name="Chilled Room"
            kg="1,204.10"
            boxes={96}
            status="3 boxes expire within 2 days"
            tone="warning"
            icon={<Archive />}
          />
          <WarehouseCard
            name="External Freezer 200"
            kg="812.60"
            boxes={64}
            status="2 boxes expired"
            tone="danger"
            icon={<Snowflake />}
          />
        </div>
      </Section>

      <Section title="Categories and items">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    c.selected
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border bg-card hover:border-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-lg px-1.5 py-0.5 text-xs tabular-nums",
                      c.selected ? "bg-primary/10" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.count}
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ITEMS.map((item) => (
                <ItemCard key={item.sku} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Pop-up windows">
        <Card>
          <CardContent className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>Items in category</DialogTrigger>
              <DialogContent className="sm:max-w-3xl">
                <DialogTitleBlock
                  icon={<Layers />}
                  title="Items in category: Fresh beef"
                  description="37 items found in this category."
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ITEMS.map((item) => (
                    <ItemCard key={item.sku} item={item} />
                  ))}
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="dark" />}>Close window</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger render={<Button />}>Label print settings</DialogTrigger>
              <DialogContent>
                <DialogTitleBlock
                  icon={<Printer />}
                  title="Label print settings 4x4"
                  description="Enter the dates to print on the item label."
                />
                <div className="rounded-2xl bg-muted/60 p-4">
                  <p className="text-xs text-muted-foreground">Item to print</p>
                  <p className="font-bold">בריסקט (3) טרי מוסדי</p>
                  <p dir="ltr" className="text-start text-sm text-muted-foreground">
                    Brisket (3) · M1057D-C
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="slaughter">Slaughter date</Label>
                    <Input id="slaughter" type="date" defaultValue="2026-10-22" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="production">Production date</Label>
                    <Input id="production" type="date" defaultValue="2026-10-22" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cert">
                      <ShieldCheck className="size-4 text-primary" />
                      Production certificate number
                    </Label>
                    <Badge variant="soft">Required</Badge>
                  </div>
                  <Input id="cert" inputMode="numeric" placeholder="e.g. 12345" />
                </div>
                <div className="rounded-2xl bg-success-soft p-4 text-success">
                  <p className="text-xs font-bold">Expiry date calculated automatically</p>
                  <p className="text-lg font-extrabold tabular-nums">22/10/2027</p>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" size="lg" />}>Cancel</DialogClose>
                  <Button size="lg">
                    <Printer data-icon="inline-start" />
                    Confirm and print label
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger render={<Button variant="destructive" />}>
                Confirm a risky action
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogTitleBlock
                  icon={<TriangleAlert />}
                  title="Reset this user's password?"
                  description="They will be signed out everywhere and must choose a new password."
                />
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" size="lg" />}>Cancel</DialogClose>
                  <Button variant="dark" size="lg">
                    Reset password
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert>
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>The Priority connection runs in stand-in mode.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Sending to Priority failed</AlertTitle>
            <AlertDescription>
              The box was saved and will be retried automatically.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Table">
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold">Northfield Foods</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell dir="ltr" className="text-start font-mono text-xs">
                  owner@example.com
                </TableCell>
                <TableCell>
                  <Badge variant="soft">Full access</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Worker One</TableCell>
                <TableCell>Receiving</TableCell>
                <TableCell dir="ltr" className="text-start font-mono text-xs">
                  worker@example.com
                </TableCell>
                <TableCell>
                  <Badge variant="success" className="me-1">
                    Catalog
                  </Badge>
                  <Badge variant="success">Receiving</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>
            The brand primary and the expiry red are different reds on purpose, and every status
            carries an icon and a label.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
