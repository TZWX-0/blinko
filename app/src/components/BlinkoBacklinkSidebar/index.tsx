import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { helper } from '@/lib/helper';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { Note } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';

type RelationType = 'references' | 'referencedBy';

interface GraphNode {
  id: number;
  title: string;
  content?: string | null;
  updatedAt?: Date | string | null;
}

interface GraphEdge {
  from: number;
  to: number;
  type: RelationType;
}

interface RelatedGraphState {
  rootId: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depthById: Map<number, number>;
  directReferences: GraphNode[];
  directBacklinks: GraphNode[];
}

const getTitleFromContent = (content: string | null | undefined, fallback: string) => {
  if (!content) return fallback;
  const title = content.split('\n').find(line => {
    if (!line.trim()) return false;
    if (helper.regex.isContainHashTag.test(line)) return false;
    return true;
  });
  return title?.trim() || fallback;
};

const buildNodeFromNote = (note: Partial<Note>, fallback: string): GraphNode | null => {
  if (!note?.id) return null;
  return {
    id: Number(note.id),
    title: getTitleFromContent(note.content ?? '', fallback),
    content: note.content ?? '',
    updatedAt: note.updatedAt ?? null,
  };
};

const buildNodeFromReference = (
  noteId: number,
  content: string | null | undefined,
  updatedAt: string | Date | null | undefined,
  fallback: string,
): GraphNode => ({
  id: noteId,
  title: getTitleFromContent(content ?? '', fallback),
  content: content ?? '',
  updatedAt: updatedAt ?? null,
});

const sortNodesByTitle = (nodes: GraphNode[]) =>
  nodes.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { sensitivity: 'base' }));

export const BlinkoBacklinkSidebar = observer(({ notes }: { notes?: Note[] }) => {
  const blinko = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 1024px)');
  const [relatedGraph, setRelatedGraph] = useState<RelatedGraphState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedNote = blinko.curSelectedNote;
  const selectedNoteId = selectedNote?.id ? Number(selectedNote.id) : null;
  const fallbackTitle = t('backlink-untitled');

  const overviewGraph = useMemo(() => {
    const nodeMap = new Map<number, GraphNode>();
    const edges: GraphEdge[] = [];

    (notes || []).forEach(note => {
      const node = buildNodeFromNote(note, fallbackTitle);
      if (node) nodeMap.set(node.id, node);

      note.references?.forEach(ref => {
        const refNode = buildNodeFromReference(
          ref.toNoteId,
          ref.toNote?.content,
          ref.toNote?.updatedAt,
          fallbackTitle,
        );
        nodeMap.set(refNode.id, refNode);
        edges.push({ from: Number(note.id), to: ref.toNoteId, type: 'references' });
      });

      note.referencedBy?.forEach(ref => {
        const refNode = buildNodeFromReference(
          ref.fromNoteId,
          ref.fromNote?.content,
          ref.fromNote?.updatedAt,
          fallbackTitle,
        );
        nodeMap.set(refNode.id, refNode);
        edges.push({ from: ref.fromNoteId, to: Number(note.id), type: 'referencedBy' });
      });
    });

    return {
      nodes: sortNodesByTitle(Array.from(nodeMap.values())),
      edges,
    };
  }, [notes, fallbackTitle]);

  useEffect(() => {
    if (!selectedNoteId) {
      setRelatedGraph(null);
      return;
    }

    let isActive = true;
    const fetchRelations = async () => {
      setIsLoading(true);
      const visited = new Set<number>();
      const nodeMap = new Map<number, GraphNode>();
      const edges: GraphEdge[] = [];
      const depthById = new Map<number, number>();

      if (selectedNote) {
        const rootNode = buildNodeFromNote(selectedNote, fallbackTitle);
        if (rootNode) nodeMap.set(rootNode.id, rootNode);
      }

      const directReferences: GraphNode[] = [];
      const directBacklinks: GraphNode[] = [];

      const queue: Array<{ id: number; depth: number }> = [{ id: selectedNoteId, depth: 0 }];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        if (visited.has(current.id)) continue;

        visited.add(current.id);
        depthById.set(current.id, current.depth);

        const [references, referencedBy] = await Promise.all([
          api.notes.noteReferenceList.mutate({ noteId: current.id, type: 'references' }),
          api.notes.noteReferenceList.mutate({ noteId: current.id, type: 'referencedBy' }),
        ]);

        references.forEach(ref => {
          const node = buildNodeFromNote(ref, fallbackTitle);
          if (node) nodeMap.set(node.id, node);
          edges.push({ from: current.id, to: Number(ref.id), type: 'references' });
          if (!visited.has(Number(ref.id))) {
            queue.push({ id: Number(ref.id), depth: current.depth + 1 });
          }
          if (current.id === selectedNoteId && node) {
            directReferences.push(node);
          }
        });

        referencedBy.forEach(ref => {
          const node = buildNodeFromNote(ref, fallbackTitle);
          if (node) nodeMap.set(node.id, node);
          edges.push({ from: Number(ref.id), to: current.id, type: 'referencedBy' });
          if (!visited.has(Number(ref.id))) {
            queue.push({ id: Number(ref.id), depth: current.depth + 1 });
          }
          if (current.id === selectedNoteId && node) {
            directBacklinks.push(node);
          }
        });
      }

      if (!isActive) return;

      setRelatedGraph({
        rootId: selectedNoteId,
        nodes: sortNodesByTitle(Array.from(nodeMap.values())),
        edges,
        depthById,
        directReferences: sortNodesByTitle(directReferences),
        directBacklinks: sortNodesByTitle(directBacklinks),
      });
      setIsLoading(false);
    };

    fetchRelations().catch(() => {
      if (isActive) setIsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [selectedNoteId, selectedNote, fallbackTitle]);

  if (!isPc) return null;

  const graphNodes = relatedGraph?.nodes ?? overviewGraph.nodes;
  const graphEdges = relatedGraph?.edges ?? overviewGraph.edges;
  const hasSelection = Boolean(selectedNoteId);

  const nodeStats = useMemo(() => {
    const stats = new Map<number, { in: number; out: number }>();
    graphEdges.forEach(edge => {
      const source = stats.get(edge.from) || { in: 0, out: 0 };
      const target = stats.get(edge.to) || { in: 0, out: 0 };
      source.out += 1;
      target.in += 1;
      stats.set(edge.from, source);
      stats.set(edge.to, target);
    });
    return stats;
  }, [graphEdges]);

  return (
    <aside className="hidden xl:flex w-80 shrink-0 border-l border-divider bg-background/60 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col">
        <div className="px-4 py-4 border-b border-divider">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Icon icon="lucide:git-branch" width={18} height={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{t('backlink-sidebar-title')}</span>
              <span className="text-xs text-desc">
                {hasSelection ? t('backlink-selected') : t('backlink-all')}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-desc">
            <span>{t('backlink-node-count', { count: graphNodes.length })}</span>
            <span>{t('backlink-edge-count', { count: graphEdges.length })}</span>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4" onBottom={() => { }}>
          {isLoading && (
            <div className="text-xs text-desc py-2">{t('backlink-loading')}</div>
          )}

          {hasSelection && relatedGraph && (
            <div className="space-y-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase text-desc">
                  <span>{t('backlink-outgoing')}</span>
                  <span>{relatedGraph.directReferences.length}</span>
                </div>
                {relatedGraph.directReferences.length === 0 ? (
                  <div className="text-xs text-desc">{t('backlink-empty')}</div>
                ) : (
                  <div className="space-y-2">
                    {relatedGraph.directReferences.map(node => (
                      <button
                        key={`out-${node.id}`}
                        className="w-full text-left rounded-lg px-2 py-2 hover:bg-hover transition"
                        onClick={() => {
                          blinko.curSelectedNote = {
                            ...(blinko.curSelectedNote || {}),
                            id: node.id,
                            content: node.content ?? '',
                            updatedAt: node.updatedAt ?? null,
                          } as Note;
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-[6px] h-2 w-2 rounded-full bg-primary/70" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{node.title}</span>
                            <span className="text-xs text-desc line-clamp-2">{node.content}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase text-desc">
                  <span>{t('backlink-incoming')}</span>
                  <span>{relatedGraph.directBacklinks.length}</span>
                </div>
                {relatedGraph.directBacklinks.length === 0 ? (
                  <div className="text-xs text-desc">{t('backlink-empty')}</div>
                ) : (
                  <div className="space-y-2">
                    {relatedGraph.directBacklinks.map(node => (
                      <button
                        key={`in-${node.id}`}
                        className="w-full text-left rounded-lg px-2 py-2 hover:bg-hover transition"
                        onClick={() => {
                          blinko.curSelectedNote = {
                            ...(blinko.curSelectedNote || {}),
                            id: node.id,
                            content: node.content ?? '',
                            updatedAt: node.updatedAt ?? null,
                          } as Note;
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-[6px] h-2 w-2 rounded-full bg-secondary/70" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{node.title}</span>
                            <span className="text-xs text-desc line-clamp-2">{node.content}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase text-desc">
                  <span>{t('backlink-related')}</span>
                  <span>{Math.max(0, graphNodes.length - 1)}</span>
                </div>
                <div className="space-y-2">
                  {graphNodes
                    .filter(node => node.id !== relatedGraph.rootId)
                    .map(node => {
                      const depth = relatedGraph.depthById.get(node.id) ?? 1;
                      const stats = nodeStats.get(node.id) || { in: 0, out: 0 };
                      return (
                        <button
                          key={`related-${node.id}`}
                          className="w-full text-left rounded-lg px-2 py-2 hover:bg-hover transition"
                          style={{ paddingLeft: `${Math.min(depth, 4) * 12 + 8}px` }}
                          onClick={() => {
                            blinko.curSelectedNote = {
                              ...(blinko.curSelectedNote || {}),
                              id: node.id,
                              content: node.content ?? '',
                              updatedAt: node.updatedAt ?? null,
                            } as Note;
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-foreground/50" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{node.title}</span>
                              <span className="text-xs text-desc">
                                {t('backlink-node-stats', { inbound: stats.in, outbound: stats.out, depth })}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </section>
            </div>
          )}

          {!hasSelection && (
            <div className="space-y-3">
              {graphNodes.length === 0 ? (
                <div className="text-xs text-desc">{t('backlink-empty')}</div>
              ) : (
                graphNodes.map(node => {
                  const stats = nodeStats.get(node.id) || { in: 0, out: 0 };
                  return (
                    <button
                      key={`overview-${node.id}`}
                      className="w-full text-left rounded-lg px-2 py-2 hover:bg-hover transition"
                      onClick={() => {
                        blinko.curSelectedNote = {
                          ...(blinko.curSelectedNote || {}),
                          id: node.id,
                          content: node.content ?? '',
                          updatedAt: node.updatedAt ?? null,
                        } as Note;
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-[6px] h-2 w-2 rounded-full bg-primary/60" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{node.title}</span>
                          <span className="text-xs text-desc">
                            {t('backlink-node-stats', { inbound: stats.in, outbound: stats.out, depth: 0 })}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </aside>
  );
});
