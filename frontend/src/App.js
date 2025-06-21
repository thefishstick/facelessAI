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
          body: JSON.stringify({ prompt: "Trump and elon musk get into a fight at the white house" })
        });
        const scriptData = await scriptRes.json();

        if (!scriptData.script) throw new Error(scriptData.error || "Script generation failed");

        setScript(scriptData.script);

        // Step 2: Generate the images
        const imageRes = await fetch("http://127.0.0.1:5000/api/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: scriptData.script })
        });

        const imageData = await imageRes.json();

        if (!imageData.images || !imageData.sentences) throw new Error(imageData.error || "Image generation failed");

        setImages(imageData.images);
        setSentences(imageData.sentences);
        setLoading(false);
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
