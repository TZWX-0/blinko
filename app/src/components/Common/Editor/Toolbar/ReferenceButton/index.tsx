import { observer } from 'mobx-react-lite'
import { BlinkoStore } from '@/store/blinkoStore'
import { RootStore } from '@/store'
import { EditorStore } from '../../editorStore'
import { useEffect, useMemo, useState } from 'react'
import { BlinkoSelectNote } from '@/components/Common/BlinkoSelectNote'
import { DialogStandaloneStore } from '@/store/module/DialogStandalone'
import { Button, Input } from '@heroui/react'
import { useTranslation } from 'react-i18next'

interface Props {
  store: EditorStore
}

const buildNoteLink = (noteId: number) => `/detail?id=${noteId}`;

const escapeMarkdownLinkText = (text: string) => text.replace(/[[\]]/g, '\\$&');

const getDefaultLinkText = (content?: string) => {
  if (!content) return '';
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
};

const ReferenceLinkDialog = observer(({
  note,
  store
}: {
  note: { id: number; content?: string };
  store: EditorStore;
}) => {
  const { t } = useTranslation();
  const dialogStore = RootStore.Get(DialogStandaloneStore);
  const defaultText = useMemo(() => getDefaultLinkText(note.content), [note.content]);
  const [linkText, setLinkText] = useState(defaultText);

  const handleConfirm = () => {
    const finalText = (linkText || defaultText || `Note ${note.id}`).trim();
    const safeText = escapeMarkdownLinkText(finalText);
    store.insertMarkdown(`[${safeText}](${buildNoteLink(note.id)})`);
    store.addReference(note.id);
    dialogStore.close();
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        label={t('insert-reference-link-label')}
        placeholder={t('insert-reference-link-placeholder')}
        value={linkText}
        onChange={(event) => setLinkText(event.target.value)}
        autoFocus
      />
      <div className="flex gap-3">
        <Button
          className="ml-auto"
          color="default"
          onPress={() => dialogStore.close()}
        >
          {t('cancel')}
        </Button>
        <Button color="primary" onPress={handleConfirm}>
          {t('confirm')}
        </Button>
      </div>
    </div>
  );
});

export const ReferenceButton = observer(({ store }: Props) => {
  const blinko = RootStore.Get(BlinkoStore)
  const dialogStore = RootStore.Get(DialogStandaloneStore);
  const { t } = useTranslation();
  useEffect(() => {
    blinko.referenceSearchList.resetAndCall({ searchText: ' ' })
  }, [])
  return (
    <BlinkoSelectNote
      onSelect={(item) => {
        dialogStore.setData({
          isOpen: true,
          onlyContent: false,
          size: 'md',
          title: t('insert-reference-link-title'),
          content: <ReferenceLinkDialog note={item} store={store} />
        });
      }}
      blackList={store.references}
    />
  )
}) 
