import { TextButton } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import { showDialog, showSheet, toast } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { Divider, SheetHandle } from '../../components/ui'
import { storeRepo } from '../../data/storeRepo'
import { pickImages, prepareImage, uploadImage, UploadError } from '../../lib/cloudinary'

type Media = 'logo' | 'banner'

const LABEL: Record<Media, string> = { logo: 'logo', banner: 'cover photo' }
const FIELD: Record<Media, string> = { logo: 'logoUrl', banner: 'bannerUrl' }
const FOLDER: Record<Media, string> = { logo: 'stores/logos', banner: 'stores/banners' }
/** A logo is drawn at 56px and a cover full width, so they are capped apart. */
const MAX_WIDTH: Record<Media, number> = { logo: 800, banner: 1600 }

/**
 * Replacing a store's logo or cover photo from the store page. Offers the
 * camera as well as the gallery: a vendor standing in their own shop usually
 * has the photo they want in front of them.
 *
 * Resolves true once the new photo is saved.
 */
export async function pickStoreMedia(media: Media): Promise<boolean> {
  // The file dialog opens inside the tap on the option, not after the sheet
  // has closed — browsers only allow a file dialog inside a user gesture.
  const picked = await showSheet<Promise<File[]>>(
    (close) => <SourceSheet media={media} onPick={(camera) => close(pickImages({ capture: camera }))} onCancel={() => close()} />,
    { handle: false, background: 'var(--color-canvas)' },
  )
  const files = picked ? await picked : []
  const file = files[0]
  if (!file) return false

  // A blocking dialog: this began from a sheet that is already gone, so
  // there is no stable place on the page left to show progress.
  let closeDialog: () => void = () => undefined
  void showDialog(
    (close) => {
      closeDialog = () => close()
      return (
        <div className="flex flex-col items-center p-5">
          <Spinner />
          <p className="t-body mt-4 text-ink">Uploading…</p>
        </div>
      )
    },
    { dismissible: false },
  )

  try {
    const url = await uploadImage(await prepareImage(file, MAX_WIDTH[media], 0.85), FOLDER[media])
    await storeRepo.patch({ [FIELD[media]]: url })
    closeDialog()
    toast(`Your ${LABEL[media]} is updated.`)
    return true
  } catch (error) {
    closeDialog()
    toast(
      error instanceof UploadError ? error.message : `Could not save your ${LABEL[media]}. Try again.`,
      { tone: 'danger' },
    )
    return false
  }
}

function SourceSheet({
  media,
  onPick,
  onCancel,
}: {
  media: Media
  onPick: (camera: boolean) => void
  onCancel: () => void
}) {
  return (
    <div className="pb-safe flex flex-col items-center">
      <div className="h-3" />
      <SheetHandle />
      <h2 className="t-h3 mt-4">Change your {LABEL[media]}</h2>
      <p className="t-caption-sm mt-1 px-5 text-center">
        {media === 'logo'
          ? 'Square works best. This is what customers see next to your name.'
          : 'Wide works best. This sits across the top of your store.'}
      </p>
      <div className="mt-5 w-full">
        <SourceTile icon="round/photo_camera" label="Take a photo" onClick={() => onPick(true)} />
        <Divider indent={20} endIndent={20} />
        <SourceTile icon="round/photo_library" label="Choose from gallery" onClick={() => onPick(false)} />
      </div>
      <div className="mt-3 pb-2">
        <TextButton onClick={onCancel}>Cancel</TextButton>
      </div>
    </div>
  )
}

function SourceTile({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ink flex h-14 w-full items-center gap-4 px-5 text-left">
      <Icon name={icon} color="var(--color-brand)" />
      <span className="t-h4 flex-1">{label}</span>
      <Icon name="round/chevron_right" size={20} color="var(--color-ink-strong)" />
    </button>
  )
}
