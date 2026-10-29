from django.shortcuts import render


def home(request):
    return render(request, 'locacoes/home.html')
