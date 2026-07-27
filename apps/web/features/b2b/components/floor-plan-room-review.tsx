'use client';

import { PointerEvent, useMemo, useState } from 'react';
import type { InteriorStyle, RoomType } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import {
  useConfirmB2BRoomsMutation,
  useReplaceB2BRoomsMutation,
} from '../api/b2b-queries';
import type {
  B2BRoom,
  DeveloperB2BProject,
  ReplaceB2BRoomsInput,
} from '../model/b2b.types';

const roomTypes: Array<{ value: RoomType; label: string }> = [
  { value: 'LIVING_ROOM', label: 'Гостиная' },
  { value: 'BEDROOM', label: 'Спальня' },
  { value: 'KITCHEN', label: 'Кухня' },
  { value: 'KIDS_ROOM', label: 'Детская' },
  { value: 'OFFICE', label: 'Кабинет' },
  { value: 'HALLWAY', label: 'Прихожая' },
  { value: 'BATHROOM', label: 'Санузел' },
  { value: 'STUDIO', label: 'Студия' },
];

const b2bStyles: Array<{ value: InteriorStyle; label: string }> = [
  { value: 'MODERN', label: 'Современный' },
  { value: 'MINIMALISM', label: 'Минимализм' },
  { value: 'SCANDI', label: 'Скандинавский' },
  { value: 'LOFT', label: 'Лофт' },
  { value: 'CLASSIC', label: 'Классика' },
  { value: 'NEOCLASSIC', label: 'Неоклассика' },
  { value: 'JAPANDI', label: 'Джапанди' },
  { value: 'PROVENCE', label: 'Прованс' },
  { value: 'ECO', label: 'Эко' },
  { value: 'HIGH_TECH', label: 'Хай-тек' },
];

type EditableRoom = ReplaceB2BRoomsInput['rooms'][number];
type DragTarget = { roomId: string; pointIndex: number } | null;

const inputClassName =
  'h-10 w-full rounded-lg border border-line/60 bg-white px-3 text-sm text-ink outline-none focus:border-brand';

export function FloorPlanRoomReview({
  project,
}: {
  project: DeveloperB2BProject;
}) {
  const [rooms, setRoomsState] = useState<EditableRoom[]>(() =>
    project.rooms.map(toEditableRoom),
  );
  const [selectedRoomId, setSelectedRoomId] = useState(
    project.rooms[0]?.id ?? '',
  );
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const replaceMutation = useReplaceB2BRoomsMutation();
  const confirmMutation = useConfirmB2BRoomsMutation();

  const selectedRoom =
    rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const canConfirm = useMemo(
    () =>
      rooms.some((room) => room.isIncluded) &&
      rooms
        .filter((room) => room.isIncluded)
        .every(
          (room) =>
            Boolean(room.name.trim()) &&
            Boolean(room.roomType) &&
            Boolean(room.widthCm && room.widthCm >= 80) &&
            Boolean(room.depthCm && room.depthCm >= 80) &&
            room.polygon.length >= 3 &&
            room.openings.every(
              (opening) =>
                opening.wallSegmentIndex >= 0 &&
                opening.wallSegmentIndex < room.polygon.length &&
                opening.positionRatio >= 0 &&
                opening.positionRatio <= 1,
            ),
        ),
    [rooms],
  );

  function setRooms(
    update: EditableRoom[] | ((current: EditableRoom[]) => EditableRoom[]),
  ) {
    setRoomsState(update);
    setDirty(true);
    setMessage(null);
  }

  function updateSelected(patch: Partial<EditableRoom>) {
    if (!selectedRoom) return;
    setRooms((current) =>
      current.map((room) =>
        room.id === selectedRoom.id ? { ...room, ...patch } : room,
      ),
    );
  }

  function updatePoint(pointIndex: number, axis: 'x' | 'y', value: number) {
    if (!selectedRoom || !Number.isFinite(value)) return;
    updateSelected({
      polygon: selectedRoom.polygon.map((point, index) =>
        index === pointIndex
          ? { ...point, [axis]: clamp(value) }
          : point,
      ),
    });
  }

  function updateOpening(
    index: number,
    patch: Partial<EditableRoom['openings'][number]>,
  ) {
    if (!selectedRoom) return;
    updateSelected({
      openings: selectedRoom.openings.map((opening, openingIndex) =>
        openingIndex === index ? { ...opening, ...patch } : opening,
      ),
    });
  }

  function addOpening(kind: 'WINDOW' | 'DOOR') {
    if (!selectedRoom) return;
    updateSelected({
      openings: [
        ...selectedRoom.openings,
        {
          id: `new-${kind.toLowerCase()}-${Date.now()}`,
          kind,
          wallSegmentIndex: 0,
          positionRatio: 0.5,
          widthCm: kind === 'WINDOW' ? 140 : 90,
          recognitionConfidence: null,
        },
      ],
    });
  }

  function addRoom() {
    const id = `new-room-${Date.now()}`;
    const offset = Math.min(0.5, rooms.length * 0.03);
    setRooms((current) => [
      ...current,
      {
        id,
        sourceLabel: null,
        name: `Комната ${current.length + 1}`,
        roomType: null,
        styleOverride: null,
        widthCm: null,
        depthCm: null,
        areaM2: null,
        ceilingHeightCm: null,
        polygon: [
          { x: 0.1 + offset, y: 0.1 + offset },
          { x: 0.3 + offset, y: 0.1 + offset },
          { x: 0.3 + offset, y: 0.3 + offset },
          { x: 0.1 + offset, y: 0.3 + offset },
        ],
        recognitionConfidence: null,
        recognitionNotes: 'Комната добавлена вручную.',
        isIncluded: true,
        openings: [],
      },
    ]);
    setSelectedRoomId(id);
  }

  function deleteSelectedRoom() {
    if (!selectedRoom || rooms.length <= 1) return;
    const nextRooms = rooms.filter((room) => room.id !== selectedRoom.id);
    setRooms(nextRooms);
    setSelectedRoomId(nextRooms[0]?.id ?? '');
  }

  async function saveRooms() {
    setMessage(null);
    try {
      await replaceMutation.mutateAsync({
        projectId: project.id,
        roomsRevision: project.roomsRevision,
        rooms,
      });
      setDirty(false);
      setMessage('Комнаты сохранены.');
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Не удалось сохранить комнаты.',
      );
    }
  }

  async function confirmRooms() {
    setMessage(null);
    try {
      await confirmMutation.mutateAsync(project.id);
      setMessage('Комнаты подтверждены и готовы к генерации.');
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Не удалось подтвердить комнаты.',
      );
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width);
    const y = clamp((event.clientY - bounds.top) / bounds.height);
    setRooms((current) =>
      current.map((room) =>
        room.id !== dragTarget.roomId
          ? room
          : {
              ...room,
              polygon: room.polygon.map((point, index) =>
                index === dragTarget.pointIndex ? { x, y } : point,
              ),
            },
      ),
    );
  }

  return (
    <section className="mt-8">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="rv-eyebrow mb-2">Проверка распознавания</p>
          <h2 className="text-3xl font-semibold text-ink">
            Комнаты, размеры и проёмы
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Перетаскивайте точки контура или задавайте координаты вручную.
          </p>
        </div>
        <button
          type="button"
          onClick={addRoom}
          className="rounded-pill border border-line/60 px-5 py-2.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Добавить комнату
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.7fr)]">
        <div className="relative overflow-hidden rounded-card border border-line/50 bg-white">
          {project.sourceImageUrl ? (
            // The SVG uses the same normalized 0..1 page space as the API.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.sourceImageUrl}
              alt="Планировка квартиры"
              className="block h-auto w-full"
            />
          ) : null}
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragTarget(null)}
            onPointerCancel={() => setDragTarget(null)}
          >
            {rooms.map((room) => {
              const selected = room.id === selectedRoom?.id;
              return (
                <g key={room.id} onClick={() => setSelectedRoomId(room.id)}>
                  <polygon
                    aria-label={`Контур ${room.name}`}
                    points={room.polygon
                      .map(({ x, y }) => `${x * 1000},${y * 1000}`)
                      .join(' ')}
                    fill={
                      selected
                        ? 'rgba(219, 80, 74, 0.22)'
                        : 'rgba(29, 78, 216, 0.12)'
                    }
                    stroke={selected ? '#db504a' : '#1d4ed8'}
                    strokeWidth={selected ? 5 : 3}
                    vectorEffect="non-scaling-stroke"
                  />
                  {room.openings.map((opening, index) => {
                    const point = openingPoint(room, opening);
                    return (
                      <circle
                        key={opening.id ?? `${room.id}-opening-${index}`}
                        cx={point.x * 1000}
                        cy={point.y * 1000}
                        r={opening.kind === 'WINDOW' ? 11 : 9}
                        fill={opening.kind === 'WINDOW' ? '#0284c7' : '#f59e0b'}
                        stroke="white"
                        strokeWidth={3}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                  {selected
                    ? room.polygon.map((point, pointIndex) => (
                        <circle
                          key={`${room.id}-point-${pointIndex}`}
                          cx={point.x * 1000}
                          cy={point.y * 1000}
                          r={12}
                          fill="white"
                          stroke="#db504a"
                          strokeWidth={4}
                          vectorEffect="non-scaling-stroke"
                          className="cursor-grab"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                            setDragTarget({
                              roomId: room.id,
                              pointIndex,
                            });
                          }}
                        />
                      ))
                    : null}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {rooms.map((room, index) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={cn(
                  'shrink-0 rounded-pill px-4 py-2 text-sm font-medium',
                  room.id === selectedRoom?.id
                    ? 'bg-dark text-white'
                    : 'border border-line/60 bg-white text-ink',
                )}
              >
                {index + 1}. {room.name}
              </button>
            ))}
          </div>

          {selectedRoom ? (
            <div className="rounded-card border border-line/50 bg-white p-5">
              <label className="flex items-center gap-3 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={selectedRoom.isIncluded}
                  onChange={(event) =>
                    updateSelected({ isIncluded: event.target.checked })
                  }
                />
                Генерировать эту комнату
              </label>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Название" className="sm:col-span-2">
                  <input
                    value={selectedRoom.name}
                    onChange={(event) =>
                      updateSelected({ name: event.target.value })
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Тип комнаты">
                  <select
                    value={selectedRoom.roomType ?? ''}
                    onChange={(event) =>
                      updateSelected({
                        roomType: (event.target.value || null) as RoomType | null,
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="">Нужно проверить</option>
                    {roomTypes.map((roomType) => (
                      <option key={roomType.value} value={roomType.value}>
                        {roomType.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Стиль комнаты">
                  <select
                    value={selectedRoom.styleOverride ?? ''}
                    onChange={(event) =>
                      updateSelected({
                        styleOverride: (event.target.value || null) as
                          | InteriorStyle
                          | null,
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="">Как в проекте</option>
                    {b2bStyles.map((style) => (
                      <option key={style.value} value={style.value}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <NumberField
                  label="Ширина, см"
                  value={selectedRoom.widthCm}
                  onChange={(widthCm) => updateSelected({ widthCm })}
                />
                <NumberField
                  label="Глубина, см"
                  value={selectedRoom.depthCm}
                  onChange={(depthCm) => updateSelected({ depthCm })}
                />
                <NumberField
                  label="Площадь, м²"
                  value={selectedRoom.areaM2}
                  step={0.1}
                  onChange={(areaM2) => updateSelected({ areaM2 })}
                />
                <NumberField
                  label="Потолок, см"
                  value={selectedRoom.ceilingHeightCm}
                  placeholder={String(project.defaultCeilingHeightCm)}
                  onChange={(ceilingHeightCm) =>
                    updateSelected({ ceilingHeightCm })
                  }
                />
              </div>

              {selectedRoom.recognitionNotes ? (
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  {selectedRoom.recognitionNotes}
                </p>
              ) : null}

              <div className="mt-5 border-t border-line/40 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    Точки контура
                  </h3>
                  <button
                    type="button"
                    onClick={deleteSelectedRoom}
                    disabled={rooms.length <= 1}
                    className="text-xs text-brand disabled:opacity-35"
                  >
                    Удалить комнату
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {selectedRoom.polygon.map((point, index) => (
                    <div
                      key={`${selectedRoom.id}-coordinate-${index}`}
                      className="grid grid-cols-2 gap-2"
                    >
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="1"
                        aria-label={`Точка ${index + 1} X`}
                        value={point.x}
                        onChange={(event) =>
                          updatePoint(index, 'x', Number(event.target.value))
                        }
                        className={inputClassName}
                      />
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="1"
                        aria-label={`Точка ${index + 1} Y`}
                        value={point.y}
                        onChange={(event) =>
                          updatePoint(index, 'y', Number(event.target.value))
                        }
                        className={inputClassName}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 border-t border-line/40 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">
                    Окна и двери
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => addOpening('WINDOW')}
                      className="rounded-pill bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700"
                    >
                      Добавить окно
                    </button>
                    <button
                      type="button"
                      onClick={() => addOpening('DOOR')}
                      className="rounded-pill bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
                    >
                      Добавить дверь
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {selectedRoom.openings.map((opening, index) => (
                    <div
                      key={opening.id ?? `${selectedRoom.id}-opening-${index}`}
                      className="grid gap-2 rounded-xl bg-line/10 p-3 sm:grid-cols-4"
                    >
                      <select
                        aria-label={`Тип проёма ${index + 1}`}
                        value={opening.kind}
                        onChange={(event) =>
                          updateOpening(index, {
                            kind: event.target.value as 'WINDOW' | 'DOOR',
                          })
                        }
                        className={inputClassName}
                      >
                        <option value="WINDOW">Окно</option>
                        <option value="DOOR">Дверь</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        max={selectedRoom.polygon.length - 1}
                        aria-label={`Стена проёма ${index + 1}`}
                        value={opening.wallSegmentIndex}
                        onChange={(event) =>
                          updateOpening(index, {
                            wallSegmentIndex: Number(event.target.value),
                          })
                        }
                        className={inputClassName}
                      />
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        aria-label={`Позиция проёма ${index + 1}`}
                        value={opening.positionRatio}
                        onChange={(event) =>
                          updateOpening(index, {
                            positionRatio: Number(event.target.value),
                          })
                        }
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateSelected({
                            openings: selectedRoom.openings.filter(
                              (_, openingIndex) => openingIndex !== index,
                            ),
                          })
                        }
                        className="rounded-lg border border-line/60 text-xs text-brand"
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {message ? (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          {message}
        </p>
      ) : null}

      <div className="sticky bottom-4 mt-6 flex flex-col justify-between gap-3 rounded-card border border-line/60 bg-white/95 p-4 shadow-float backdrop-blur sm:flex-row sm:items-center">
        <span className="text-sm text-ink-soft">
          Включено комнат: {rooms.filter((room) => room.isIncluded).length}
        </span>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={saveRooms}
            disabled={!dirty || replaceMutation.isPending}
            className="rounded-pill border border-line/60 px-6 py-3 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {replaceMutation.isPending ? 'Сохраняем...' : 'Сохранить комнаты'}
          </button>
          <button
            type="button"
            onClick={confirmRooms}
            disabled={
              dirty || !canConfirm || confirmMutation.isPending
            }
            className="rounded-pill bg-dark px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {confirmMutation.isPending
              ? 'Подтверждаем...'
              : 'Подтвердить комнаты'}
          </button>
        </div>
      </div>
    </section>
  );
}

function toEditableRoom(room: B2BRoom): EditableRoom {
  return {
    id: room.id,
    sourceLabel: room.sourceLabel,
    name: room.name,
    roomType: room.roomType,
    styleOverride: room.styleOverride,
    widthCm: room.widthCm,
    depthCm: room.depthCm,
    areaM2: room.areaM2,
    ceilingHeightCm: room.ceilingHeightCm,
    polygon: room.polygon.map((point) => ({ ...point })),
    recognitionConfidence: room.recognitionConfidence,
    recognitionNotes: room.recognitionNotes,
    isIncluded: room.isIncluded,
    openings: room.openings.map((opening) => ({ ...opening })),
  };
}

function openingPoint(
  room: EditableRoom,
  opening: EditableRoom['openings'][number],
) {
  const start = room.polygon[opening.wallSegmentIndex] ?? room.polygon[0];
  const end =
    room.polygon[(opening.wallSegmentIndex + 1) % room.polygon.length] ??
    start;
  return {
    x: start.x + (end.x - start.x) * opening.positionRatio,
    y: start.y + (end.y - start.y) * opening.positionRatio,
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function NumberField({
  label,
  value,
  step = 1,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | null;
  step?: number;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
        className={inputClassName}
      />
    </Field>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
