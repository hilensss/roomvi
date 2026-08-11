'use client';

import { PointerEvent, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/api-client';
import type { InteriorStyle, RoomType } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import {
  b2bQueryKeys,
  useConfirmB2BRoomsMutation,
  useReplaceB2BRoomsMutation,
} from '../api/b2b-queries';
import {
  getB2BFloorPlanUrl,
  getB2BProject,
} from '../api/b2b-api';
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

type EditableRoom = Omit<
  ReplaceB2BRoomsInput['rooms'][number],
  'id'
> & { id: string };
type DragTarget =
  | { kind: 'point'; roomId: string; pointIndex: number }
  | { kind: 'opening'; roomId: string; openingIndex: number }
  | null;

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
  const queryClient = useQueryClient();

  const selectedRoom =
    rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const includedRoomCount = rooms.filter((room) => room.isIncluded).length;
  const confirmationIssues = useMemo(
    () => getRoomConfirmationIssues(rooms),
    [rooms],
  );
  const canConfirm =
    includedRoomCount > 0 && confirmationIssues.length === 0;

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

  function addContourPoint() {
    if (!selectedRoom || selectedRoom.polygon.length >= 80) return;
    updateSelected(splitLongestPolygonSegment(selectedRoom));
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
        rooms: rooms.map(toServerRoom),
      });
      setDirty(false);
      setMessage('Комнаты сохранены.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        await recoverFromConflict();
        return;
      }
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
      await confirmMutation.mutateAsync({
        projectId: project.id,
        roomsRevision: project.roomsRevision,
      });
      setMessage('Комнаты подтверждены и готовы к генерации.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        await recoverFromConflict();
        return;
      }
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Не удалось подтвердить комнаты.',
      );
    }
  }

  async function recoverFromConflict() {
    try {
      const refreshed = await getB2BProject(project.id);
      queryClient.setQueryData(
        b2bQueryKeys.detail(project.id),
        refreshed,
      );
      if (refreshed.type !== 'DEVELOPER_FLOOR_PLAN') {
        throw new Error('Unexpected project type');
      }
      const refreshedRooms = refreshed.rooms.map(toEditableRoom);
      setRoomsState(refreshedRooms);
      setSelectedRoomId(refreshedRooms[0]?.id ?? '');
      setDirty(false);
      setMessage(
        'Комнаты изменились в другой вкладке. Загружена актуальная версия.',
      );
    } catch {
      setMessage(
        'Комнаты изменились в другой вкладке. Обновите страницу и повторите изменения.',
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
          : dragTarget.kind === 'point'
            ? {
                ...room,
                polygon: room.polygon.map((point, index) =>
                  index === dragTarget.pointIndex ? { x, y } : point,
                ),
              }
            : {
                ...room,
                openings: room.openings.map((opening, index) =>
                  index === dragTarget.openingIndex
                    ? {
                        ...opening,
                        ...nearestOpeningPlacement(
                          room.polygon,
                          { x, y },
                          bounds.width,
                          bounds.height,
                        ),
                      }
                    : opening,
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
            Перетаскивайте точки контура, окна и двери или задавайте параметры
            вручную.
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
        <div className="relative self-start overflow-hidden rounded-card border border-line/50 bg-white">
          {project.sourcePlanFileId ? (
            // The SVG uses the same normalized 0..1 page space as the API.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getB2BFloorPlanUrl(project.id)}
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
                        aria-label={`Переместить ${
                          opening.kind === 'WINDOW' ? 'окно' : 'дверь'
                        } ${index + 1}`}
                        cx={point.x * 1000}
                        cy={point.y * 1000}
                        r={opening.kind === 'WINDOW' ? 11 : 9}
                        fill={opening.kind === 'WINDOW' ? '#0284c7' : '#f59e0b'}
                        stroke="white"
                        strokeWidth={3}
                        vectorEffect="non-scaling-stroke"
                        className="cursor-grab"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelectedRoomId(room.id);
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          setDragTarget({
                            kind: 'opening',
                            roomId: room.id,
                            openingIndex: index,
                          });
                        }}
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
                              kind: 'point',
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
                  label="Длина, см"
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
                <p className="text-xs leading-relaxed text-ink-soft sm:col-span-2">
                  Ширина и длина — размеры комнаты по двум сторонам на плане.
                  Например, размер 3 488 означает примерно 349 см. Площадь
                  можно не заполнять.
                </p>
              </div>

              {selectedRoom.recognitionNotes ? (
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  {selectedRoom.recognitionNotes}
                </p>
              ) : null}
              {selectedRoom.recognitionConfidence !== null ? (
                <p className="mt-3 text-xs text-ink-soft">
                  Уверенность распознавания:{' '}
                  {Math.round(selectedRoom.recognitionConfidence * 100)}%
                </p>
              ) : null}

              <div className="mt-5 border-t border-line/40 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">
                    Точки контура
                  </h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={addContourPoint}
                      disabled={selectedRoom.polygon.length >= 80}
                      className="rounded-pill border border-line/60 px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-35"
                    >
                      Добавить точку контура
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedRoom}
                      disabled={rooms.length <= 1}
                      className="text-xs text-brand disabled:opacity-35"
                    >
                      Удалить комнату
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  Новая точка появится в середине самой длинной стороны.
                  Перетащите её в нужный угол.
                </p>
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
                      className="grid gap-2 rounded-xl bg-line/10 p-3 sm:grid-cols-5"
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
                        min={30}
                        max={1000}
                        aria-label={`Ширина проёма ${index + 1}`}
                        value={opening.widthCm ?? ''}
                        onChange={(event) =>
                          updateOpening(index, {
                            widthCm: event.target.value
                              ? Number(event.target.value)
                              : null,
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
        <div className="text-sm text-ink-soft">
          <p>Включено комнат: {includedRoomCount}</p>
          {includedRoomCount === 0 ? (
            <p className="mt-1 text-amber-700">
              Для подтверждения включите хотя бы одну комнату.
            </p>
          ) : confirmationIssues.length > 0 ? (
            <div className="mt-1 text-amber-700">
              <p>Для подтверждения заполните:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {confirmationIssues.map((issue) => (
                  <li key={issue.roomId}>
                    {issue.roomName} — {issue.fields.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : dirty ? (
            <p className="mt-1 text-amber-700">
              Сначала сохраните внесённые изменения.
            </p>
          ) : (
            <p className="mt-1 text-emerald-700">
              Все обязательные данные заполнены.
            </p>
          )}
        </div>
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

function getRoomConfirmationIssues(rooms: EditableRoom[]) {
  return rooms.flatMap((room, index) => {
    if (!room.isIncluded) return [];

    const fields: string[] = [];
    if (!room.name.trim()) fields.push('название');
    if (!room.roomType) fields.push('тип комнаты');
    if (room.widthCm === null || room.widthCm < 80) fields.push('ширина');
    if (room.depthCm === null || room.depthCm < 80) fields.push('длина');
    if (room.polygon.length < 3) fields.push('контур');
    if (
      room.openings.some(
        (opening) =>
          opening.wallSegmentIndex < 0 ||
          opening.wallSegmentIndex >= room.polygon.length ||
          opening.positionRatio < 0 ||
          opening.positionRatio > 1,
      )
    ) {
      fields.push('окна и двери');
    }

    return fields.length > 0
      ? [
          {
            roomId: room.id,
            roomName: room.name.trim() || `Комната ${index + 1}`,
            fields,
          },
        ]
      : [];
  });
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

function toServerRoom(
  room: EditableRoom,
): ReplaceB2BRoomsInput['rooms'][number] {
  return {
    ...room,
    ...(isUuid(room.id) ? { id: room.id } : { id: undefined }),
    openings: room.openings.map((opening) => ({
      ...(opening.id && isUuid(opening.id) ? { id: opening.id } : {}),
      kind: opening.kind,
      wallSegmentIndex: opening.wallSegmentIndex,
      positionRatio: opening.positionRatio,
      widthCm: opening.widthCm,
      recognitionConfidence: opening.recognitionConfidence,
    })),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function splitLongestPolygonSegment(room: EditableRoom) {
  let longestSegmentIndex = 0;
  let longestSegmentLength = -1;

  room.polygon.forEach((start, index) => {
    const end = room.polygon[(index + 1) % room.polygon.length];
    const length = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    if (length > longestSegmentLength) {
      longestSegmentIndex = index;
      longestSegmentLength = length;
    }
  });

  const start = room.polygon[longestSegmentIndex];
  const end = room.polygon[(longestSegmentIndex + 1) % room.polygon.length];
  const insertIndex = longestSegmentIndex + 1;
  const polygon = [
    ...room.polygon.slice(0, insertIndex),
    { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    ...room.polygon.slice(insertIndex),
  ];
  const openings = room.openings.map((opening) => {
    if (opening.wallSegmentIndex < longestSegmentIndex) return opening;
    if (opening.wallSegmentIndex > longestSegmentIndex) {
      return {
        ...opening,
        wallSegmentIndex: opening.wallSegmentIndex + 1,
      };
    }
    if (opening.positionRatio <= 0.5) {
      return { ...opening, positionRatio: opening.positionRatio * 2 };
    }
    return {
      ...opening,
      wallSegmentIndex: longestSegmentIndex + 1,
      positionRatio: (opening.positionRatio - 0.5) * 2,
    };
  });

  return { polygon, openings };
}

function nearestOpeningPlacement(
  polygon: EditableRoom['polygon'],
  point: { x: number; y: number },
  width: number,
  height: number,
) {
  let wallSegmentIndex = 0;
  let positionRatio = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const pointerX = point.x * width;
  const pointerY = point.y * height;

  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const startX = start.x * width;
    const startY = start.y * height;
    const segmentX = (end.x - start.x) * width;
    const segmentY = (end.y - start.y) * height;
    const segmentLength = segmentX ** 2 + segmentY ** 2;
    const ratio =
      segmentLength === 0
        ? 0
        : clamp(
            ((pointerX - startX) * segmentX +
              (pointerY - startY) * segmentY) /
              segmentLength,
          );
    const projectedX = startX + segmentX * ratio;
    const projectedY = startY + segmentY * ratio;
    const distance =
      (pointerX - projectedX) ** 2 + (pointerY - projectedY) ** 2;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      wallSegmentIndex = index;
      positionRatio = ratio;
    }
  });

  return { wallSegmentIndex, positionRatio };
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
