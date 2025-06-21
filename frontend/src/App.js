import { useEffect, useState } from 'react';

function App() {
  const [script, setScript] = useState('');
  const [images, setImages] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
  
        // Step 1: Generate the script
        const scriptRes = await fetch("http://127.0.0.1:5000/api/generate-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "Explain how the pyramids were built in ancient egypt" })
        });
        const scriptData = await scriptRes.json();
  
        if (!scriptData.script) throw new Error(scriptData.error || "Script generation failed");
  
        setScript(scriptData.script);
  
        // Step 2: Start image generation (async job)
        const startRes = await fetch("http://127.0.0.1:5000/api/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: scriptData.script })
        });
        const { job_id } = await startRes.json();
  
        // Step 3: Poll until images are ready
        const poll = async () => {
          const statusRes = await fetch(`http://127.0.0.1:5000/api/image-status/${job_id}`);
          const statusData = await statusRes.json();
  
          if (statusData.status === "done") {
            setImages(statusData.images);
            setSentences(statusData.sentences);
            setLoading(false);
          } else {
            setTimeout(poll, 3000); // Retry in 3 seconds
          }
        };
  
        poll();
      } catch (err) {
        console.error(err);
        setError(err.message);
        setLoading(false);
      }
    };
  
    run();
  }, []);
  

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
              width: 270, // 9:16 aspect ratio (e.g. 270x480)
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
          </div>
        ))}
      </div>
    </div>
  );
  
}

export default App;
