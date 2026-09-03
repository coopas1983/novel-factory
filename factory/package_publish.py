from pathlib import Path
from .publisher import write_packages
def main():
    book=Path("books/live-gemini-pilot")
    for p in write_packages(book):
        print("PUBLISH_PACKAGE_READY",p)
if __name__=="__main__":
    main()
