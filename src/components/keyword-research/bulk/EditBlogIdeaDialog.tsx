import { Button, DialogShell, Field, SelectField } from "@/ui";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_BLOG_IDEA_UPDATED, NOTIFY_TITLE_AND_KEYWORD_ARE_REQUIRED } from "@/lib/notify-messages";
import type { CSVRow } from '@/lib/bulk-auto-generate';
import {
  importRowLinkEditorUrls,
  serializeModifierLinksJson,
} from "@/lib/bulk/bulk-csv-parser";
import { BlogIdeaModifierLinksEditor } from "@/components/keyword-research/bulk/BlogIdeaModifierLinksEditor";

const FEATURED_IMAGE_OPTIONS = [
  { value: "y", label: "Yes" },
  { value: "n", label: "No" },
] as const;

interface EditBlogIdeaDialogProps {
  editingIndex: number | null;
  setEditingIndex: (index: number | null) => void;
  editFormData: CSVRow | null;
  setEditFormData: (data: CSVRow | null) => void;
  setGeneratedRows: (rows: CSVRow[] | ((prev: CSVRow[]) => CSVRow[])) => void;
}

export function EditBlogIdeaDialog({
  editingIndex,
  setEditingIndex,
  editFormData,
  setEditFormData,
  setGeneratedRows,
}: EditBlogIdeaDialogProps) {
  const handleSave = () => {
    if (!editFormData || editingIndex === null) return;

    if (!editFormData.title.trim() || !editFormData.keyword.trim()) {
      notify.error(NOTIFY_TITLE_AND_KEYWORD_ARE_REQUIRED);
      return;
    }

    // Update the row at the editing index
    setGeneratedRows(prev => {
      const updated = [...prev];
      updated[editingIndex] = editFormData;
      return updated;
    });

    notify.success(NOTIFY_BLOG_IDEA_UPDATED);
    setEditingIndex(null);
    setEditFormData(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditFormData(null);
  };

  return (
    <DialogShell
      open={editingIndex !== null}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
      }}
      size="lg"
      title="Edit Blog Idea"
      description="Modify the blog idea details below."
      actions={
        <>
          <Button variant="tool" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="run" onClick={handleSave}>
            Save Changes
          </Button>
        </>
      }
    >
      {editFormData && (
        <>
          <Field
            placeholder="Title (required)"
            value={editFormData.title}
            onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
          />
          <Field
            placeholder="Keyword (required)"
            value={editFormData.keyword}
            onChange={(e) => setEditFormData({ ...editFormData, keyword: e.target.value })}
          />
          <Field
            placeholder="Entity (optional)"
            value={editFormData.entity || ''}
            onChange={(e) => setEditFormData({ ...editFormData, entity: e.target.value || undefined })}
          />
          <Field
            placeholder="Meta description (optional)"
            value={editFormData.meta_description || ''}
            onChange={(e) => setEditFormData({ ...editFormData, meta_description: e.target.value || undefined })}
          />
          <Field
            placeholder="Modifier (optional)"
            value={editFormData.modifier || ''}
            onChange={(e) => setEditFormData({ ...editFormData, modifier: e.target.value || undefined })}
          />
          <Field
            placeholder="Slug (optional)"
            value={editFormData.target_slug || ''}
            onChange={(e) => setEditFormData({ ...editFormData, target_slug: e.target.value.trim() || undefined })}
          />
          <BlogIdeaModifierLinksEditor
            idPrefix="edit-blog-idea"
            links={importRowLinkEditorUrls(editFormData)}
            onChange={(urls) =>
              setEditFormData({
                ...editFormData,
                modifier_links_json: serializeModifierLinksJson(urls),
              })
            }
          />
          <SelectField
            placeholder="Featured image"
            width="sm"
            value={editFormData.featuredImage || 'y'}
            options={FEATURED_IMAGE_OPTIONS}
            onValueChange={(value) => setEditFormData({ ...editFormData, featuredImage: value })}
          />
        </>
      )}
    </DialogShell>
  );
}
