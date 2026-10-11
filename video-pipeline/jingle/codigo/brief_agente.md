# Brief for shot-generation agents (jingle "Un día más")

Tools: ElevenLabs MCP (load via ToolSearch: "select:mcp__ElevenLabs__creative_add_flow_node,mcp__ElevenLabs__creative_run_flow_nodes,mcp__ElevenLabs__creative_get_flow_run_status,mcp__ElevenLabs__creative_get_flow_node,mcp__ElevenLabs__creative_connect_flow_nodes,mcp__ElevenLabs__creative_attach_reference_file,mcp__ElevenLabs__creative_get_model_schema").
Flow: `seP7JD7KZswLrh0CpvbY` (all nodes go here).

Shot data: /tmp/claude-0/-home-user/2611f717-6182-5311-8e6b-eee5393945e0/scratchpad/jingle/tomas.json — fields `estilo`, `refs`, and `tomas` = [id, wardrobe ("A","B" or "-" = no people), image description, motion prompt].

## Step 1 — still image per shot
gpt-image-2, node_type image-generation, model_parameters {"aspect_ratio":"9:16","resolution":"2K","quality":"high"}, generations_count=2.
Prompt = image description + " " + estilo (+ " " + refs if wardrobe is A or B).
Identity references (connect into the image input) for shots with people:
- always Marisol portrait node `jzbLqM8cCLNelYTcSs5C` and Diego portrait node `PNTCykAPBo3p6EM34cY6`
- wardrobe A: also `BccRR4JCH9YL5YOEOVYX` (couple, wardrobe A); wardrobe B: also `5Rsia7Zuxx2vwDLU2SW6` (couple, beach wardrobe B).
Shots with "-" get no references.
Download both variants to /tmp/claude-0/-home-user/2611f717-6182-5311-8e6b-eee5393945e0/scratchpad/jingle/img/<id>_a.png / _b.png.
LOOK at both (Read tool). Pick the better: real-photo look (no plastic/AI sheen), correct anatomy (hands/fingers/feet), faces match Marisol/Diego, matches the description, family-friendly. If both fail badly, re-run that node once with a clarified prompt.

## Step 2 — video per shot
Convert the chosen PNG to JPG (ffmpeg -q:v 2) at /home/user/express-js-on-vercel/video-pipeline/jingle/start/<id>.jpg, then commit and push:
  cd /home/user/express-js-on-vercel && git add video-pipeline/jingle/start && git commit -m "jingle: cuadros de inicio <ids>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01EpBjoeKwsgcdjVndmsKxv2" && git pull --rebase origin claude/marketing-videos-aws-lbai65 && git push -u origin claude/marketing-videos-aws-lbai65
(other agents push to the same branch at the same time: on a rejected push, pull --rebase again and retry, up to 5 times with 2/4/8/16 s waits). Batch several shots per commit.
Attach https://raw.githubusercontent.com/therealj94/express-js-on-vercel/claude/marketing-videos-aws-lbai65/video-pipeline/jingle/start/<id>.jpg with creative_attach_reference_file and wire it into the start_frame port of a minimax-h3-max node (node_type video-generation, model_parameters {"resolution":"768p","duration_secs":6}; do NOT pass aspect_ratio; kling is not approved). Prompt = motion prompt + " Photorealistic, natural motion, real physics, stable faces and hands, cinematic." generations_count=1.
Download to /tmp/claude-0/-home-user/2611f717-6182-5311-8e6b-eee5393945e0/scratchpad/jingle/c/<id>.mp4. Make a 6-frame strip (python cv2) and LOOK at it: reject melting faces, extra limbs, warped hands, identity drift, impossible physics. Retry a failed clip once with a refined prompt (keep the better).

Poll with bash waits (`S=$(date +%s); until [ $(( $(date +%s) - S )) -ge 45 ]; do sleep 5; done`). Run independent nodes in parallel (several nodes per run_flow_nodes call). Never paste signed URLs.

Final report: per shot — chosen variant, issues, image node id, video node id, final status (OK / usable with issues / failed); total credits and cost (1 credit ≈ $0.0001).
