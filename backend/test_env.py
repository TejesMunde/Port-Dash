"""Checks for the UI-writable AWS config. Run: python test_env.py"""
import os, tempfile
os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")
ENV = os.path.join(tempfile.mkdtemp(), ".env")
os.environ["ENV_FILE"] = ENV
import main

def env_dict():
    return dict(l.split("=", 1) for l in open(ENV).read().splitlines() if "=" in l)

# Appends to a file that does not exist yet.
main.write_env({"AWS_REGION": "ap-south-1"})
assert env_dict()["AWS_REGION"] == "ap-south-1"

# Existing unrelated lines survive, and a comment is not mistaken for a value line.
open(ENV, "w").write("SECRET_KEY=keep-me\n# comment\nAWS_REGION=old\n")
main.write_env({"AWS_REGION": "us-east-1", "LIGHTSAIL_INSTANCE": "portscale"})
body = open(ENV).read()
assert env_dict()["SECRET_KEY"] == "keep-me", body
assert env_dict()["AWS_REGION"] == "us-east-1", body
assert env_dict()["LIGHTSAIL_INSTANCE"] == "portscale", body
assert "# comment" in body, body
assert body.count("AWS_REGION=") == 1, "replaced in place, not duplicated"

# A commented-out key is uncommented rather than duplicated -- the shipped .env
# ships LIGHTSAIL_INSTANCE commented out, so this is the real first-run case.
open(ENV, "w").write("# LIGHTSAIL_INSTANCE=\n")
main.write_env({"LIGHTSAIL_INSTANCE": "portscale"})
assert open(ENV).read().strip() == "LIGHTSAIL_INSTANCE=portscale", open(ENV).read()

# Secrets never land in a world-readable file.
assert oct(os.stat(ENV).st_mode)[-3:] == "600"

# Status must ask for credentials when the instance is unset, and never claim ok.
os.environ.pop("LIGHTSAIL_INSTANCE", None)
st = main.lightsail_status()
assert st["configured"] is False and st["needs_credentials"] is True, st

# Bad credentials must also prompt, not silently look configured.
os.environ.update(LIGHTSAIL_INSTANCE="nope", AWS_ACCESS_KEY_ID="AKIAnotreal000000000",
                  AWS_SECRET_ACCESS_KEY="x" * 40)
st = main.lightsail_status()
assert st["configured"] is False and st["needs_credentials"] is True, st

print("env checks ok")
