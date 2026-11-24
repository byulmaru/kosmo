<script lang="ts">
  import { AlertDialog } from 'bits-ui';
  import { Button } from '#lib/components/ui/button/index.js';

  type Props = {
    action: 'suspend' | 'restore';
    actionHref: string;
    targetKind: 'profile' | 'instance';
    targetName: string;
  };

  let { action, actionHref, targetKind, targetName }: Props = $props();
</script>

<AlertDialog.Root>
  <AlertDialog.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-label={`${action === 'suspend' ? 'Suspend' : 'Restore'} ${targetKind} ${targetName}`}
        size="sm"
        variant={action === 'suspend' ? 'destructive' : 'outline'}
      >
        {action === 'suspend' ? 'Suspend' : 'Restore'}
      </Button>
    {/snippet}
  </AlertDialog.Trigger>

  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <AlertDialog.Content
      class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-6 rounded-lg border bg-background p-6 shadow-lg"
    >
      <AlertDialog.Title class="text-lg font-semibold">
        {action === 'suspend' ? 'Suspend' : 'Restore'}
        {targetKind}
        {targetName}?
      </AlertDialog.Title>

      <form method="POST" action={actionHref} class="grid gap-4">
        {#if action === 'suspend'}
          <label class="grid gap-2 text-sm font-medium">
            Reason (optional)
            <textarea
              name="reason"
              rows="3"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            ></textarea>
          </label>
        {/if}

        <div class="flex justify-end gap-2">
          <AlertDialog.Cancel>
            {#snippet child({ props })}
              <Button {...props} type="button" variant="outline">Cancel</Button>
            {/snippet}
          </AlertDialog.Cancel>
          <Button type="submit" variant={action === 'suspend' ? 'destructive' : 'default'}>
            {action === 'suspend' ? 'Suspend' : 'Restore'}
          </Button>
        </div>
      </form>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
