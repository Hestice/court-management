"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  DndContext,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { createSnapModifier } from "@dnd-kit/modifiers";
import {
  ChevronRight,
  LocateFixed,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useNavGuard } from "@/components/admin-nav-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Court } from "@/app/admin/courts/schema";
import { saveLayout } from "./actions";

const CELL_SIZE = 40;
const COURT_CELLS_W = 2;
const COURT_CELLS_H = 4;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

type Viewport = { x: number; y: number; zoom: number };

type EditorCourt = Pick<
  Court,
  "id" | "name" | "is_active" | "position_x" | "position_y"
>;

export function FloorPlanEditor({
  initialCourts,
}: {
  initialCourts: Court[];
}) {
  const [courts, setCourts] = useState<EditorCourt[]>(() =>
    initialCourts.map((c) => ({
      id: c.id,
      name: c.name,
      is_active: c.is_active,
      position_x: c.position_x,
      position_y: c.position_y,
    })),
  );
  const [baseline, setBaseline] = useState<EditorCourt[]>(() =>
    initialCourts.map((c) => ({
      id: c.id,
      name: c.name,
      is_active: c.is_active,
      position_x: c.position_x,
      position_y: c.position_y,
    })),
  );
  const [saving, startSaving] = useTransition();

  const dirty = useMemo(() => !layoutsMatch(courts, baseline), [courts, baseline]);

  // Register nav guard + beforeunload while dirty.
  useNavGuard(
    useCallback(() => {
      if (!dirty) return true;
      return window.confirm("You have unsaved changes. Leave anyway?");
    }, [dirty]),
  );

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Viewport (pan + zoom), measured against the canvas container rect.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [viewportReady, setViewportReady] = useState(false);
  const readyRef = useRef(false);

  // On mount, fit viewport to the initial placed-court bounding box. Falls back
  // to origin when nothing is placed. Captured from initialCourts so state
  // changes during the session don't trigger a re-fit.
  const initialPlacedRef = useRef<EditorCourt[]>(
    initialCourts
      .filter((c) => c.position_x !== null && c.position_y !== null)
      .map((c) => ({
        id: c.id,
        name: c.name,
        is_active: c.is_active,
        position_x: c.position_x,
        position_y: c.position_y,
      })),
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const center = () => {
      if (readyRef.current) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setViewport(computeFitViewport(r, initialPlacedRef.current));
      setViewportReady(true);
      readyRef.current = true;
    };
    center();
    const ro = new ResizeObserver(center);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Non-passive wheel listener so we can preventDefault and zoom-to-cursor.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cursorX = e.clientX - r.left;
      const cursorY = e.clientY - r.top;
      setViewport((v) => zoomViewport(v, cursorX, cursorY, -e.deltaY));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pan: track pointer state locally.
  const panState = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  }>({ active: false, lastX: 0, lastY: 0 });
  const [panning, setPanning] = useState(false);

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // clicked a child (court); skip
    if (e.button !== 0) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panState.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    setPanning(true);
  };
  const onCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current.active) return;
    const dx = e.clientX - panState.current.lastX;
    const dy = e.clientY - panState.current.lastY;
    panState.current.lastX = e.clientX;
    panState.current.lastY = e.clientY;
    setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current.active) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer might already be released
    }
    panState.current.active = false;
    setPanning(false);
  };

  // Track cursor position over canvas for drop math.
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Convert a pointer position (relative to canvas) into cell coords.
  const pointerToCell = useCallback(
    (relX: number, relY: number) => {
      const cx = (relX - viewport.x) / viewport.zoom;
      const cy = (relY - viewport.y) / viewport.zoom;
      return {
        x: Math.round(cx / CELL_SIZE - COURT_CELLS_W / 2),
        y: Math.round(cy / CELL_SIZE - COURT_CELLS_H / 2),
      };
    },
    [viewport],
  );

  // Grid snap modifier tracks current zoom so drag feedback aligns.
  const snapModifier = useMemo<Modifier>(
    () => createSnapModifier(CELL_SIZE * viewport.zoom),
    [viewport.zoom],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
  );

  const placedCourts = courts.filter(
    (c) => c.position_x !== null && c.position_y !== null,
  );
  const unplacedCourts = courts.filter(
    (c) => c.position_x === null || c.position_y === null,
  );

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const isSidebar = activeId.startsWith("sidebar:");
    const courtId = isSidebar ? activeId.slice("sidebar:".length) : activeId;

    if (isSidebar) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = cursorRef.current.x - rect.left;
      const cy = cursorRef.current.y - rect.top;
      if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return;
      const cell = pointerToCell(cx, cy);
      setCourts((prev) =>
        prev.map((c) =>
          c.id === courtId ? { ...c, position_x: cell.x, position_y: cell.y } : c,
        ),
      );
      return;
    }

    const delta = e.delta;
    const dxCells = Math.round(delta.x / (CELL_SIZE * viewport.zoom));
    const dyCells = Math.round(delta.y / (CELL_SIZE * viewport.zoom));
    if (dxCells === 0 && dyCells === 0) return;
    setCourts((prev) =>
      prev.map((c) => {
        if (c.id !== courtId) return c;
        if (c.position_x === null || c.position_y === null) return c;
        return {
          ...c,
          position_x: c.position_x + dxCells,
          position_y: c.position_y + dyCells,
        };
      }),
    );
  }

  function unplace(id: string) {
    setCourts((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, position_x: null, position_y: null } : c,
      ),
    );
  }

  function zoomTo(newZoom: number) {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setViewport((v) => zoomViewport(v, r.width / 2, r.height / 2, 0, newZoom));
  }

  function recenter() {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setViewport(computeFitViewport(r, placedCourts));
  }

  function goToCourt(court: EditorCourt) {
    if (court.position_x === null || court.position_y === null) {
      toast.info("This court isn't placed on the floor plan.");
      return;
    }
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const courtCenterContentX =
      (court.position_x + COURT_CELLS_W / 2) * CELL_SIZE;
    const courtCenterContentY =
      (court.position_y + COURT_CELLS_H / 2) * CELL_SIZE;
    setViewport({
      x: r.width / 2 - courtCenterContentX,
      y: r.height / 2 - courtCenterContentY,
      zoom: 1,
    });
  }

  function onSave() {
    startSaving(async () => {
      const result = await saveLayout(
        courts.map((c) => ({
          id: c.id,
          position_x: c.position_x,
          position_y: c.position_y,
        })),
      );
      if (result.success) {
        setBaseline(courts);
        toast.success("Layout saved");
      } else {
        toast.error(result.error ?? "Failed to save layout.");
      }
    });
  }

  return (
    <TooltipProvider>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onPointerMove={(e) => {
          cursorRef.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <DndContext
          sensors={sensors}
          modifiers={[snapModifier]}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-h-0 flex-1">
            <div className="relative flex min-w-0 flex-1 flex-col">
              <Toolbar
                zoom={viewport.zoom}
                dirty={dirty}
                saving={saving}
                courts={courts}
                hasPlacedCourts={placedCourts.length > 0}
                onZoomIn={() =>
                  zoomTo(Math.min(MAX_ZOOM, viewport.zoom + 0.1))
                }
                onZoomOut={() =>
                  zoomTo(Math.max(MIN_ZOOM, viewport.zoom - 0.1))
                }
                onResetZoom={() => zoomTo(1)}
                onRecenter={recenter}
                onGoToCourt={goToCourt}
                onSave={onSave}
              />
              <Canvas
                ref={canvasRef}
                viewport={viewport}
                ready={viewportReady}
                panning={panning}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={endPan}
                onPointerCancel={endPan}
              >
                {placedCourts.map((c) => (
                  <PlacedCourt
                    key={c.id}
                    court={c}
                    onUnplace={() => unplace(c.id)}
                  />
                ))}
              </Canvas>
            </div>
            <UnplacedSidebar courts={unplacedCourts} />
          </div>
        </DndContext>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Canvas
// ============================================================================

function Canvas({
  ref,
  viewport,
  ready,
  panning,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  viewport: Viewport;
  ready: boolean;
  panning: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const gridPx = CELL_SIZE * viewport.zoom;
  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "relative flex-1 touch-none select-none overflow-hidden bg-[#fafafa]",
        panning ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
        backgroundSize: `${gridPx}px ${gridPx}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
    >
      {ready ? (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Placed court (draggable rectangle on the canvas)
// ============================================================================

function PlacedCourt({
  court,
  onUnplace,
}: {
  court: EditorCourt;
  onUnplace: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: court.id });

  if (court.position_x === null || court.position_y === null) return null;

  const left = court.position_x * CELL_SIZE;
  const top = court.position_y * CELL_SIZE;
  const dragTransform = transform
    ? `translate(${transform.x}px, ${transform.y}px)`
    : undefined;

  // "Court 3" → "3" so the glyph can fill the rectangle. Custom names fall
  // back to the full label at smaller size.
  const numberMatch = court.name.trim().match(/^Court\s+(\d+)$/i);
  const label = numberMatch ? numberMatch[1] : court.name;
  const labelClass = numberMatch
    ? "text-4xl font-bold tabular-nums"
    : "text-xs font-medium";

  return (
    <div
      ref={setNodeRef}
      style={{
        left,
        top,
        width: COURT_CELLS_W * CELL_SIZE,
        height: COURT_CELLS_H * CELL_SIZE,
        transform: dragTransform,
      }}
      className={cn(
        "group absolute flex items-center justify-center rounded-md text-center",
        court.is_active
          ? "border-2 border-primary bg-primary/20"
          : "border-2 border-dashed border-muted-foreground/60 bg-muted/40",
        isDragging ? "cursor-grabbing opacity-60 shadow-lg" : "cursor-grab",
      )}
      {...listeners}
      {...attributes}
    >
      <span
        className={cn(
          labelClass,
          court.is_active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onUnplace();
        }}
        aria-label={`Remove ${court.name} from floor plan`}
        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

// ============================================================================
// Unplaced sidebar
// ============================================================================

function UnplacedSidebar({ courts }: { courts: EditorCourt[] }) {
  const [open, setOpen] = useState(true);

  if (courts.length === 0) return null;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-l border-border bg-card transition-[width]",
        open ? "w-64" : "w-10",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        {open ? (
          <h2 className="text-sm font-medium">
            Unplaced courts ({courts.length})
          </h2>
        ) : (
          <span className="sr-only">Unplaced courts</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")}
            aria-hidden
          />
        </Button>
      </div>
      {open ? (
        <ul className="flex flex-1 flex-col gap-1 overflow-auto p-2">
          {courts.map((c) => (
            <UnplacedItem key={c.id} court={c} />
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function UnplacedItem({ court }: { court: EditorCourt }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `sidebar:${court.id}` });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn(
        "flex cursor-grab items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm",
        isDragging ? "cursor-grabbing opacity-70" : "",
      )}
      {...listeners}
      {...attributes}
    >
      <span>{court.name}</span>
      <Badge variant="secondary">drag</Badge>
    </li>
  );
}

// ============================================================================
// Toolbar
// ============================================================================

function Toolbar({
  zoom,
  dirty,
  saving,
  courts,
  hasPlacedCourts,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onRecenter,
  onGoToCourt,
  onSave,
}: {
  zoom: number;
  dirty: boolean;
  saving: boolean;
  courts: EditorCourt[];
  hasPlacedCourts: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onRecenter: () => void;
  onGoToCourt: (c: EditorCourt) => void;
  onSave: () => void;
}) {
  const [goToOpen, setGoToOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-1 rounded-md border border-border px-1 py-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onZoomOut} aria-label="Zoom out">
              <Minus className="h-4 w-4" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <span className="min-w-[3.5rem] text-center text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onZoomIn} aria-label="Zoom in">
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" onClick={onResetZoom} aria-label="Reset zoom">
            <RotateCcw className="h-4 w-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset zoom (100%)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" onClick={onRecenter} aria-label="Recenter">
            <LocateFixed className="h-4 w-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasPlacedCourts ? "Recenter on courts" : "Recenter on origin"}
        </TooltipContent>
      </Tooltip>
      <Popover open={goToOpen} onOpenChange={setGoToOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="gap-1">
            <Search className="h-4 w-4" aria-hidden />
            Go to court
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search courts…" />
            <CommandList>
              <CommandEmpty>No courts.</CommandEmpty>
              <CommandGroup>
                {courts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      onGoToCourt(c);
                      setGoToOpen(false);
                    }}
                  >
                    <span>{c.name}</span>
                    {c.position_x === null || c.position_y === null ? (
                      <Badge variant="secondary" className="ml-auto">
                        unplaced
                      </Badge>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="ml-auto flex items-center gap-2">
        {dirty ? <Badge variant="secondary">Unsaved changes</Badge> : null}
        <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Saving…" : "Save Layout"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

// Fit the viewport so the placed-court bounding box sits at canvas center,
// at 100% zoom. When nothing is placed, fall back to origin at canvas center.
function computeFitViewport(
  rect: { width: number; height: number },
  placed: EditorCourt[],
): Viewport {
  if (placed.length === 0) {
    return { x: rect.width / 2, y: rect.height / 2, zoom: 1 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of placed) {
    if (c.position_x === null || c.position_y === null) continue;
    if (c.position_x < minX) minX = c.position_x;
    if (c.position_y < minY) minY = c.position_y;
    const right = c.position_x + COURT_CELLS_W;
    const bottom = c.position_y + COURT_CELLS_H;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  const cxContent = ((minX + maxX) / 2) * CELL_SIZE;
  const cyContent = ((minY + maxY) / 2) * CELL_SIZE;
  return {
    x: rect.width / 2 - cxContent,
    y: rect.height / 2 - cyContent,
    zoom: 1,
  };
}

function layoutsMatch(a: EditorCourt[], b: EditorCourt[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((c) => [c.id, c]));
  for (const ca of a) {
    const cb = byId.get(ca.id);
    if (!cb) return false;
    if (ca.position_x !== cb.position_x || ca.position_y !== cb.position_y) {
      return false;
    }
  }
  return true;
}

function zoomViewport(
  v: Viewport,
  cursorX: number,
  cursorY: number,
  wheelDelta: number,
  absolute?: number,
): Viewport {
  const target =
    absolute ??
    clamp(v.zoom * (wheelDelta > 0 ? 1.1 : wheelDelta < 0 ? 1 / 1.1 : 1), MIN_ZOOM, MAX_ZOOM);
  const newZoom = clamp(target, MIN_ZOOM, MAX_ZOOM);
  const ratio = newZoom / v.zoom;
  return {
    x: cursorX - (cursorX - v.x) * ratio,
    y: cursorY - (cursorY - v.y) * ratio,
    zoom: newZoom,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
