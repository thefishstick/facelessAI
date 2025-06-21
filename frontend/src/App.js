import { useEffect, useState, useRef } from 'react';

function App() {
  const [script, setScript] = useState('');
  const [images, setImages] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [audioUrls, setAudioUrls] = useState([]);
  const [finalVideoUrl, setFinalVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollingTimeoutRef = useRef(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        const scriptRes = await fetch("http://127.0.0.1:5000/api/generate-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "Explain how the pyramids were built in ancient egypt" })
        });
        const scriptData = await scriptRes.json();
        if (!scriptData.script) throw new Error(scriptData.error || "Script generation failed");
        setScript(scriptData.script);

        const startRes = await fetch("http://127.0.0.1:5000/api/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: scriptData.script })
        });
        const { job_id } = await startRes.json();

        const pollUntilDone = async () => {
          const res = await fetch(`http://127.0.0.1:5000/api/image-status/${job_id}`);
          const data = await res.json();

          if (data.status === "done") {
            clearTimeout(pollingTimeoutRef.current);
            setImages(data.images);
            setSentences(data.sentences);

            const audioResults = await Promise.all(
              data.sentences.map(async (sentence) => {
                const res = await fetch("http://127.0.0.1:5000/api/generate-audio", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: sentence })
                });
                const data = await res.json();
                return data.audio_url || null;
              })
            );

            setAudioUrls(audioResults);
            setLoading(false);
          } else {
            pollingTimeoutRef.current = setTimeout(pollUntilDone, 3000);
          }
        };

        pollUntilDone();
      } catch (err) {
        console.error(err);
        setError(err.message);
        setLoading(false);
      }

      return () => clearTimeout(pollingTimeoutRef.current);
    };

    run();
  }, []);

  const handleCreateFinalVideo = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/compile-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          images,
          audio_urls: audioUrls
        })
      });

      const data = await res.json();
      console.log("🎬 Final video URL:", data.video_url);
      if (data.video_url) {
        setFinalVideoUrl(data.video_url);
      }
    } catch (err) {
      console.error("Failed to create final video:", err);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Generating script and images...</div>;
  if (error) return <div style={{ padding: 20, color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Video Script</h1>
      <div style={{ display: 'flex', overflowX: 'auto', gap: 20 }}>
        {sentences.map((sentence, i) => (
          <div
            key={i}
            style={{
              flexShrink: 0,
              width: 270,
              textAlign: 'center'
            }}
          >
            <img
              src={images[i]}
              alt={`Scene ${i + 1}`}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: 8,
                display: 'block'
              }}
            />
            <p style={{ marginTop: 8 }}>{sentence}</p>
            {audioUrls[i] && (
              <audio controls style={{ marginTop: 8, width: '100%' }}>
                <source src={audioUrls[i]} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            )}
          </div>
        ))}
      </div>

      {audioUrls.length === sentences.length && (
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <button
            onClick={handleCreateFinalVideo}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            🎬 Create Final Video
          </button>
        </div>
      )}

      {finalVideoUrl && (
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <h2>Your Final Video</h2>
          <video
            controls
            style={{ width: '100%', maxWidth: '600px', borderRadius: 10 }}
            src={finalVideoUrl}
          />
        </div>
      )}
    </div>
  );
}

export default App;
