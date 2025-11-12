from flask import Flask, render_template

app = Flask(__name__, template_folder="templates")


@app.route("/")
def index():
    return render_template("eaglercraftx.html")


if __name__ == "__main__":
    # Bind to 0.0.0.0 so the app is accessible from other hosts; port 80 requires appropriate privileges.
    app.run(host="0.0.0.0", port=80)