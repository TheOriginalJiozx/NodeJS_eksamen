<script>
  import "../tailwind.css";
  import { afterNavigate } from '$app/navigation';
  import { Toaster } from "svelte-5-french-toast";

  /** @param {String} str */
  
  function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  afterNavigate (({ to }) => {
    const path = to?.url.pathname || '/';
    const page = path === '/' ? 'Home' : path.slice(1);
    document.title = `Colouriana - ${capitalizeFirstLetter(page)}`;
  });
</script>

<slot />

<Toaster position="top-right" />