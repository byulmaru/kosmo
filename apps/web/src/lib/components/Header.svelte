<script lang="ts">
  import Button from './Button.svelte';
  import SearchBar from './SearchBar.svelte';

  type HeaderVariant =
    | 'default'
    | 'search_main'
    | 'search_input'
    | 'title_action'
    | 'back_title'
    | 'cancel_action'
    | 'cancel_apply';

  type HeaderProps = {
    variant?: HeaderVariant;
    title?: string;
    inputText?: string;
    actionLabel?: string;
  };

  let {
    variant = 'default',
    title = '타이틀',
    inputText = '검색어 입력중...',
    actionLabel = '게시',
  }: HeaderProps = $props();
</script>

<header class="border-border bg-card flex h-16 w-[390px] items-center gap-3 border-b px-4">
  {#if variant === 'default'}
    <button class="grid size-8 place-items-center" type="button" aria-label="메뉴">
      <span class="text-xl leading-none">☰</span>
    </button>
    <strong class="text-text-primary flex-1 text-center text-2xl leading-none">KOSMO</strong>
    <button class="grid size-8 place-items-center" type="button" aria-label="설정">
      <span class="text-xl leading-none">⚙</span>
    </button>
  {:else if variant === 'search_main'}
    <button class="grid size-8 place-items-center" type="button" aria-label="메뉴">
      <span class="text-xl leading-none">☰</span>
    </button>
    <SearchBar placeholder="어떤 걸 찾아볼까요?" class="h-8 flex-1 border-0 px-0 [&>div]:h-8" />
    <button class="grid size-8 place-items-center" type="button" aria-label="설정">
      <span class="text-xl leading-none">⚙</span>
    </button>
  {:else if variant === 'search_input'}
    <button class="grid size-8 place-items-center" type="button" aria-label="뒤로">
      <span class="text-xl leading-none">‹</span>
    </button>
    <div class="bg-card text-text-primary flex h-8 flex-1 items-center rounded-full px-2 text-base">
      {inputText}
    </div>
    <button
      class="border-border grid size-10 place-items-center rounded-full border"
      type="button"
      aria-label="검색"
    >
      <span class="text-base leading-none">⌕</span>
    </button>
  {:else if variant === 'title_action'}
    <h1 class="text-text-primary m-0 flex-1 text-[17px] font-bold">{title}</h1>
    <button class="grid size-8 place-items-center" type="button" aria-label="설정">
      <span class="text-xl leading-none">⚙</span>
    </button>
  {:else if variant === 'back_title'}
    <button class="grid size-8 place-items-center" type="button" aria-label="뒤로">
      <span class="text-xl leading-none">‹</span>
    </button>
    <h1 class="text-text-primary m-0 flex-1 text-[17px] font-bold">{title}</h1>
  {:else}
    <button class="text-text-secondary text-sm" type="button">취소</button>
    <span class="flex-1"></span>
    <Button size="sm">{variant === 'cancel_apply' ? '적용' : actionLabel}</Button>
  {/if}
</header>
