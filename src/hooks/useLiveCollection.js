import { useEffect, useRef, useState } from "react";

/**
 * Subscribe a component to a Firestore collection for as long as it is mounted.
 *
 * Several admin pages held their data in local `useState` and filled it with a
 * one-shot `Service.getAll()` inside a `useEffect`. That reads the collection
 * exactly once, at mount. Anything written afterwards — by another admin, by a
 * Cloud Function, or by the very same page in a different tab — stayed
 * invisible until someone reloaded. The clearest symptom was a diet offer that
 * had already been deleted still rendering on screen.
 *
 * This replaces that pattern without changing how pages consume the data: it
 * still hands back a plain array.
 *
 * Behaviour worth knowing:
 *
 *   - The repository is imported lazily. `repositories/index.js` instantiates
 *     every repository at module load, which touches Firebase config; deferring
 *     it keeps that cost off the initial bundle and out of the render path.
 *
 *   - On listener error the previous data is kept and `error` is set. Blanking
 *     the list would make a dropped connection look identical to an empty
 *     collection, which is the single most alarming thing to show an operator
 *     mid-service.
 *
 *   - Soft-deleted documents (`isDeleted: true`) are already filtered out by
 *     `BaseRepository.listenAll`.
 *
 * @param {string} repositoryName  export name from `../repositories`,
 *                                 e.g. "dietBannerRepository"
 * @returns {{data: object[], loading: boolean, error: string|null}}
 */
export function useLiveCollection(repositoryName) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Guards against a late-resolving dynamic import calling setState after the
  // component has gone, and against the unsubscribe being lost in that window.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let unsubscribe = null;

    setLoading(true);
    setError(null);

    import("../repositories")
      .then((repos) => {
        const repo = repos[repositoryName];
        if (!repo) {
          throw new Error(`Unknown repository "${repositoryName}"`);
        }
        if (!aliveRef.current) return;

        unsubscribe = repo.listenAll(
          (items) => {
            if (!aliveRef.current) return;
            setData(items);
            setLoading(false);
            setError(null);
          },
          (err) => {
            if (!aliveRef.current) return;
            setError(err.message || "Live updates stopped.");
            setLoading(false);
          },
        );

        // The import resolved after unmount — tear down immediately rather
        // than leaking a listener for the life of the session.
        if (!aliveRef.current && unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      })
      .catch((err) => {
        if (!aliveRef.current) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      aliveRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, [repositoryName]);

  return { data, loading, error };
}

export default useLiveCollection;
